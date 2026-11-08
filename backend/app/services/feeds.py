"""Curated WHO weekly adapter. No caller-supplied URLs or credentials are fetched."""

import csv
import io
import threading
import time
from datetime import date, timedelta
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError

from app.models.models import Case, Feed, FeedRun, Location
from app.services.alerts import evaluate_alerts
from app.services.observations import lock_locations, validate_intervals
from app.services.surveillance import revision, snapshot, utcnow

WHO_URL = "https://srhdpeuwpubsa.blob.core.windows.net/whdh/COVID/WHO-COVID-19-global-data.csv"
WHO_PAGE = "https://data.who.int/dashboards/covid19/data"
_lock = threading.Lock()
_cached_at = float("-inf")
_cached_rows = None


def load_who_rows():
    global _cached_at, _cached_rows
    with _lock:
        if _cached_rows is not None and time.monotonic() - _cached_at < 900:
            return _cached_rows
        try:
            with urlopen(
                Request(
                    WHO_URL, headers={"User-Agent": "HealthMap360/0.2 weekly feed connector", "Accept": "text/csv"}
                ),
                timeout=30,
            ) as response:
                content = response.read(25 * 1024 * 1024 + 1)
            if len(content) > 25 * 1024 * 1024:
                raise ValueError("WHO feed exceeds the download limit")
            reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")), strict=True)
            if not {"Date_reported", "Country_code", "Country", "New_cases"}.issubset(reader.fieldnames or []):
                raise ValueError("WHO feed columns changed; the adapter needs review")
            rows = list(reader)
            if not rows or len(rows) > 500000:
                raise ValueError("WHO feed is empty or exceeds the row limit")
        except (URLError, OSError, ValueError, csv.Error) as exc:
            raise HTTPException(503, f"Could not load the WHO feed: {str(exc)[:250]}") from None
        _cached_rows = rows
        _cached_at = time.monotonic()
        return rows


def catalog():
    countries = {}
    for row in load_who_rows():
        code = row["Country_code"].strip().upper()
        if len(code) == 2:
            countries[code] = {"code": code, "name": row["Country"].strip()}
    return {
        "providers": [
            {
                "id": "who_covid_weekly",
                "name": "WHO COVID-19 · weekly country reports",
                "disease": "covid-19",
                "source_url": WHO_PAGE,
                "reporting_period_days": 7,
                "description": "Country-level counts attributed to reporting weeks. Missing reports are not zero. Reporting frequency and completeness vary; source revisions are preserved.",
            }
        ],
        "countries": sorted(countries.values(), key=lambda country: country["name"]),
    }


def validate_feed(db, data):
    location = db.get(Location, data.location_id)
    if not location:
        raise HTTPException(422, "Choose a saved country location")
    if (location.administrative_level or "").strip().lower() != "country":
        raise HTTPException(
            422, "WHO reports are country-level. Add the country in Settings and choose it instead of a city."
        )
    countries = {country["code"]: country["name"] for country in catalog()["countries"]}
    if data.country_code not in countries:
        raise HTTPException(422, "Country code is not present in the source")
    if location.country_code:
        matches = location.country_code == data.country_code
    else:
        matches = location.name_key == " ".join(countries[data.country_code].split()).casefold()
    if not matches:
        raise HTTPException(
            422, "The source country does not match the saved country. Choose its matching country location."
        )


def claimed_feed(db, feed_id, force=False):
    now = utcnow()
    filters = [Feed.id == feed_id, Feed.enabled.is_(True), or_(Feed.lease_until.is_(None), Feed.lease_until < now)]
    if not force:
        filters.append(or_(Feed.next_sync_at.is_(None), Feed.next_sync_at <= now))
    result = db.execute(update(Feed).where(*filters).values(lease_until=now + timedelta(minutes=5)))
    if result.rowcount == 1:
        db.execute(
            update(FeedRun)
            .where(FeedRun.feed_id == feed_id, FeedRun.status == "running")
            .values(
                status="failed",
                message="Previous sync was interrupted; its lease expired and a new attempt was started.",
                finished_at=now,
            )
        )
    db.commit()
    return result.rowcount == 1


def sync_feed(db, feed_id, force=False):
    if not claimed_feed(db, feed_id, force):
        raise HTTPException(409, "Feed is paused, not due, or already syncing")
    feed = db.get(Feed, feed_id)
    started = utcnow()
    run = FeedRun(feed_id=feed.id, status="running", started_at=started, imported=0, updated=0, skipped=0, message="")
    db.add(run)
    db.commit()
    run_id = run.id
    try:
        rows = load_who_rows()
        observations, latest = parse_reports(rows, feed.country_code, feed.start_date)
        lock_locations(db, [feed.location_id])
        existing = {
            record.date: record
            for record in db.scalars(
                select(Case).where(Case.location_id == feed.location_id, Case.disease == "covid-19")
            )
        }
        if any(record.date in observations and record.feed_id != feed.id for record in existing.values()):
            raise ValueError("An analyst-owned observation exists in this interval; feed sync cannot overwrite it.")
        candidates = [
            Case(
                location_id=feed.location_id,
                disease="covid-19",
                date=day,
                reporting_period_days=7,
                case_count=count,
                severity="unassessed",
            )
            for day, count in observations.items()
        ]
        validate_intervals(
            db,
            candidates,
            [record.id for record in existing.values() if record.feed_id == feed.id and record.date in observations],
        )
        imported = updated = skipped = 0
        for day, count in observations.items():
            record = existing.get(day)
            if record and record.feed_id != feed.id:
                raise ValueError(
                    f"An analyst-owned observation already exists on {day}. Feed sync cannot overwrite it."
                )
            # Do not mix overlapping daily reports with weekly national totals.
            for other in existing.values():
                if (
                    other.feed_id != feed.id
                    and other.date >= day - timedelta(days=6)
                    and other.date - timedelta(days=other.reporting_period_days - 1) <= day
                ):
                    raise ValueError(
                        "Manual observations overlap this feed's reporting weeks. Resolve overlapping sources first."
                    )
            if record is None:
                record = Case(
                    location_id=feed.location_id,
                    date=day,
                    disease="covid-19",
                    case_count=count,
                    severity="unassessed",
                    source="WHO COVID-19 weekly country reports",
                    reporting_period_days=7,
                    feed_id=feed.id,
                    provenance="source",
                )
                db.add(record)
                db.flush()
                revision(db, record, None, "feed_import", feed_id=feed.id)
                imported += 1
            elif record.case_count != count:
                before = snapshot(record)
                record.case_count = count
                record.version += 1
                revision(db, record, before, "feed_revision", feed_id=feed.id)
                updated += 1
            else:
                skipped += 1
        evaluate_alerts(db)
        run = db.get(FeedRun, run_id)
        run.status = "success"
        run.imported, run.updated, run.skipped = imported, updated, skipped
        run.latest_report_date = latest
        run.message = "WHO source revisions are tracked. New reports are unassessed; case counts do not determine response priority."
        if not observations:
            run.message = (
                f"No reports in the selected interval. Latest source report: {latest}. Missing reports are not zero."
            )
        elif latest < date.today() - timedelta(days=30):
            run.message += f" Source reporting is stale: latest report {latest}."
        feed.last_error = None
        feed.last_synced_at = utcnow()
        feed.next_sync_at = utcnow() + timedelta(minutes=feed.interval_minutes)
        feed.lease_until = None
        run.finished_at = utcnow()
        db.commit()
    except Exception as exc:
        db.rollback()
        feed = db.get(Feed, feed_id)
        run = db.get(FeedRun, run_id)
        message = str(exc.detail) if isinstance(exc, HTTPException) else str(exc)
        if isinstance(exc, IntegrityError):
            message = "Data changed during sync. No records were imported; retry."
        run.status, run.message, run.finished_at = "failed", message[:1000], utcnow()
        feed.last_error = message[:600]
        feed.next_sync_at = utcnow() + timedelta(minutes=min(feed.interval_minutes, 60))
        feed.lease_until = None
        db.commit()
    return db.get(FeedRun, run_id)


def parse_reports(rows, country_code, start_date):
    observations = {}
    latest = None
    for row in rows:
        if row["Country_code"].strip().upper() != country_code:
            continue
        if not row["New_cases"].strip():
            continue  # Missing surveillance data must not become a zero.
        report_date = date.fromisoformat(row["Date_reported"])
        count_text = row["New_cases"].strip()
        if not count_text.lstrip("-").isdigit():
            raise ValueError(f"Invalid source count on {report_date}")
        count = int(count_text)
        if report_date > date.today():
            continue
        latest = max(latest, report_date) if latest else report_date
        if report_date < start_date:
            continue
        if not 0 <= count <= 2147483647:
            raise ValueError(
                f"Source contains a negative retrospective adjustment or oversized count on {report_date}. Nothing was imported; this interval requires source review."
            )
        if report_date in observations and observations[report_date] != count:
            raise ValueError("Source has conflicting duplicate reporting weeks")
        observations[report_date] = count
    if latest is None:
        raise ValueError("No numeric reports are available for this source country")
    return observations, latest
