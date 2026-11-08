"""Read-only PHAC laboratory context; never writes detections into case observations."""

import csv
import io
import threading
import time
from datetime import date
from decimal import Decimal, InvalidOperation
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException

from app.services.surveillance import utcnow

SOURCE_URL = "https://health-infobase.canada.ca/src/data/respiratory-virus-detections/download/RVD_WeeklyData.csv"
METHOD_URL = "https://health-infobase.canada.ca/respiratory-virus-surveillance/about.html"
PROVINCES = {
    "CA-AB": "Alberta",
    "CA-BC": "British Columbia",
    "CA-MB": "Manitoba",
    "CA-NB": "New Brunswick",
    "CA-NL": "Newfoundland and Labrador",
    "CA-NS": "Nova Scotia",
    "CA-NT": "Northwest Territories",
    "CA-NU": "Nunavut",
    "CA-ON": "Ontario",
    "CA-PE": "Prince Edward Island",
    "CA-QC": "Quebec",
    "CA-SK": "Saskatchewan",
    "CA-YT": "Yukon",
}
VIRUSES = {"SARS-CoV-2": "COVID-19", "Influenza": "Influenza", "RSV": "RSV"}
_lock = threading.Lock()
_cache = None
_cached_at = float("-inf")


def load_laboratory():
    global _cache, _cached_at
    with _lock:
        if _cache is not None and time.monotonic() - _cached_at < 900:
            return _cache
        try:
            with urlopen(
                Request(
                    SOURCE_URL, headers={"User-Agent": "HealthMap360/0.3 surveillance context", "Accept": "text/csv"}
                ),
                timeout=20,
            ) as response:
                body = response.read(10 * 1024 * 1024 + 1)
            if len(body) > 10 * 1024 * 1024:
                raise ValueError("Source exceeds download limit")
            reader = csv.DictReader(io.StringIO(body.decode("utf-8-sig")), strict=True)
            if not {"province", "date", "virus", "tests", "detections", "percentpositive"}.issubset(
                reader.fieldnames or []
            ):
                raise ValueError("Source columns changed")
            rows = list(reader)
            if len(rows) > 100000:
                raise ValueError("Source exceeds record limit")
            _cache = (rows, utcnow())
            _cached_at = time.monotonic()
            return _cache
        except (URLError, TimeoutError, OSError, UnicodeError, csv.Error, ValueError):
            raise HTTPException(
                502, "PHAC laboratory data is unavailable or changed format. Retry later; case reports are unaffected."
            ) from None


def number(value, *, integer=False):
    if value is None or value.strip().upper() in ("", "N/A", "NA", "NULL", "..", "—"):
        return None
    try:
        result = Decimal(value)
        if not result.is_finite() or result < 0 or (integer and result != result.to_integral_value()):
            raise ValueError("Invalid source value")
        return int(result) if integer else float(result)
    except (InvalidOperation, ValueError):
        raise HTTPException(
            502, "PHAC laboratory data contains an unsupported value. Source review is required."
        ) from None


def laboratory_context(location, end, rows, retrieved_at):
    province = (
        PROVINCES.get(location.region_code)
        if location.geographic_scope == "regional" and location.country_code == "CA"
        else None
    )
    if not province:
        raise HTTPException(
            422,
            "Choose a Canadian province or territory with its matching region identifier. City-level laboratory estimates are not available.",
        )
    selected = {}
    try:
        for row in rows:
            if row["province"] != province or row["virus"] not in VIRUSES:
                continue
            day = date.fromisoformat(row["date"])
            if day > end:
                continue
            key = (day, row["virus"])
            if key in selected:
                raise ValueError("Duplicate area/virus/week")
            tests = number(row["tests"], integer=True)
            detections = number(row["detections"], integer=True)
            positivity = number(row["percentpositive"])
            if (positivity is not None and positivity > 100) or (
                tests is not None and detections is not None and detections > tests
            ):
                raise ValueError("Invalid laboratory counts")
            if tests == 0 and positivity is not None:
                raise ValueError("Percentage without tests")
            selected[key] = {
                "date": day,
                "virus": VIRUSES[row["virus"]],
                "tests": tests,
                "detections": detections,
                "percent_positive": positivity,
            }
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            502, "PHAC laboratory data is ambiguous or changed format. Source review is required."
        ) from None
    latest = max((key[0] for key in selected), default=None)
    # One common week: never silently carry a missing virus forward from an older week.
    indicators = []
    for virus, label in VIRUSES.items():
        record = selected.get((latest, virus))
        indicators.append(
            record or {"date": latest, "virus": label, "tests": None, "detections": None, "percent_positive": None}
        )
    return {
        "metric": "test_positivity",
        "unit": "percent",
        "reporting_period_days": 7,
        "location_id": location.id,
        "reporting_area": province,
        "source_name": "PHAC FluWatch+ laboratory surveillance",
        "source_url": SOURCE_URL,
        "methodology_url": METHOD_URL,
        "retrieved_at": retrieved_at,
        "requested_date": end,
        "latest_report_date": latest,
        "historical": bool(latest and (date.today() - latest).days > 30),
        "indicators": indicators,
        "history": sorted(selected.values(), key=lambda row: (row["date"], row["virus"]))[-36:],
        "limitations": "Participating-laboratory results, not population case counts. Testing practices and participation can change; missing values stay unavailable. Weeks run Sunday to Saturday. A successful download does not establish source freshness. No case observations, alerts or publications are created from these indicators.",
    }
