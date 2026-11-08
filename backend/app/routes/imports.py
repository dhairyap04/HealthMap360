import csv
import io
import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy import select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.auth.security import analyst
from app.core.config import get_settings
from app.db.session import get_db
from app.models.models import Case, ImportBatch, Location, User
from app.routes.data import normalize_name
from app.schemas.health import CaseInput, LocationInput
from app.services.alerts import evaluate_alerts
from app.services.locations import active_location
from app.services.observations import classify_provenance, lock_locations, validate_intervals
from app.services.surveillance import revision

router = APIRouter(prefix="/imports", tags=["imports"])
REQUIRED = ("date", "location", "disease", "case_count")
OPTIONAL = ("metric", "severity", "source", "latitude", "longitude", "reporting_period_days")


@router.get("")
def history(user: User = Depends(analyst), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(ImportBatch).options(joinedload(ImportBatch.user)).order_by(ImportBatch.id.desc()).limit(100)
    ).all()
    return [
        {
            "id": row.id,
            "filename": row.filename,
            "imported": row.imported,
            "skipped": row.skipped,
            "created_at": row.created_at,
            "username": row.user.username,
        }
        for row in rows
    ]


@router.post("", status_code=201)
def import_csv(
    file: UploadFile = File(...),
    mapping: str = Form("{}"),
    user: User = Depends(analyst),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(422, "Choose a CSV file")
    try:
        content = file.file.read(settings.max_upload_bytes + 1)
        if len(content) > settings.max_upload_bytes:
            raise HTTPException(413, "CSV exceeds the 50 MB limit")
        text = content.decode("utf-8-sig")
        if "\x00" in text:
            raise HTTPException(422, "CSV contains invalid null characters")
        reader = csv.DictReader(io.StringIO(text), strict=True)
        headers = [h.strip() for h in reader.fieldnames or []]
        if not headers or len(set(headers)) != len(headers) or any(not h for h in headers):
            raise HTTPException(422, "CSV needs unique, nonempty column headers")
        reader.fieldnames = headers
        columns = json.loads(mapping)
        if not isinstance(columns, dict) or any(
            k not in REQUIRED + OPTIONAL or not isinstance(v, str) for k, v in columns.items()
        ):
            raise HTTPException(422, "Invalid column mapping")
        columns = {key: columns.get(key, key) for key in REQUIRED + OPTIONAL}
        if any(columns[key] not in headers for key in REQUIRED):
            raise HTTPException(422, "Map date, location, disease and case_count to CSV columns")
        active = [v for k, v in columns.items() if k in REQUIRED or v in headers]
        if len(set(active)) != len(active):
            raise HTTPException(422, "Each field must map to a different column")
        locations = {loc.name_key: loc for loc in db.scalars(select(Location))}
        pending_locations = {}
        observations = {}
        errors = []
        error_count = 0
        duplicates = 0
        row_count = 0
        # Restrict duplicate checks to the observations in this file.
        row_numbers = {}
        for row_number, row in enumerate(reader, start=2):
            row_count += 1
            if row_count > settings.max_import_rows:
                raise HTTPException(
                    413, f"CSV exceeds {settings.max_import_rows:,} records; split it into smaller files"
                )
            try:
                if None in row or any(v is None for v in row.values()):
                    raise ValueError("Row has a different number of columns than its header")

                def get(key, values=row):
                    return (values.get(columns[key]) or "").strip()

                location_name = " ".join(get("location").split())
                key = normalize_name(location_name)
                if not location_name:
                    raise ValueError("Location is required")
                location = locations.get(key)
                coordinates = (get("latitude"), get("longitude"))
                supplied = None
                if any(coordinates):
                    supplied = LocationInput(name=location_name, latitude=coordinates[0], longitude=coordinates[1])
                if location is None:
                    if supplied is None and key not in pending_locations:
                        raise ValueError(
                            "Unknown location: provide latitude and longitude, or create the location first"
                        )
                    if supplied:
                        previous = pending_locations.get(key)
                        if previous and (previous.latitude, previous.longitude) != (
                            supplied.latitude,
                            supplied.longitude,
                        ):
                            raise ValueError("Conflicting coordinates for this location")
                        pending_locations[key] = supplied
                elif supplied and (
                    abs(location.latitude - supplied.latitude) > 0.00001
                    or abs(location.longitude - supplied.longitude) > 0.00001
                ):
                    raise ValueError("Coordinates do not match the existing location")
                count = get("case_count")
                if not count.isascii() or not count.isdigit():
                    raise ValueError("Case count must be a nonnegative integer")
                date_value = get("date")
                if len(date_value) != 10 or date_value[4] != "-" or date_value[7] != "-":
                    raise ValueError("Date must use YYYY-MM-DD")
                observation = CaseInput(
                    metric=get("metric") or "reported_cases",
                    location_id=location.id if location else 1,
                    date=date_value,
                    disease=get("disease"),
                    case_count=int(count),
                    severity=get("severity").lower() or "unassessed",
                    source=get("source") or None,
                    reporting_period_days=int(get("reporting_period_days") or "1"),
                )
                identity = (key, observation.date, observation.disease)
                previous = observations.get(identity)
                comparison = previous
                if comparison:
                    if (
                        comparison.case_count,
                        comparison.severity,
                        comparison.source or None,
                        comparison.reporting_period_days,
                    ) != (
                        observation.case_count,
                        observation.severity,
                        observation.source,
                        observation.reporting_period_days,
                    ):
                        raise ValueError(
                            "Conflicting observation for this location, date and disease; edit the existing record"
                        )
                    duplicates += 1
                    continue
                observations[identity] = observation
                row_numbers[identity] = row_number
            except (ValueError, ValidationError) as exc:
                error_count += 1
                if len(errors) < 50:
                    message = (
                        "; ".join(f"{e['loc'][0]}: {e['msg']}" for e in exc.errors())
                        if isinstance(exc, ValidationError)
                        else str(exc)
                    )
                    errors.append({"row": row_number, "message": message})
        if not row_count:
            raise HTTPException(422, "CSV has no data rows")
        lock_locations(db, [locations[key].id for key, _, _ in observations if key in locations])
        identities = [(locations[key].id, day, disease) for key, day, disease in observations if key in locations]
        existing = {}
        for offset in range(0, len(identities), 200):
            found = db.scalars(
                select(Case).where(
                    tuple_(Case.location_id, Case.date, Case.disease).in_(identities[offset : offset + 200])
                )
            )
            existing.update({(record.location_id, record.date, record.disease): record for record in found})
        for identity, observation in list(observations.items()):
            key, day, disease = identity
            stored = existing.get((locations[key].id, day, disease)) if key in locations else None
            if stored:
                if (stored.case_count, stored.severity, stored.source or None, stored.reporting_period_days) == (
                    observation.case_count,
                    observation.severity,
                    observation.source,
                    observation.reporting_period_days,
                ):
                    duplicates += 1
                    del observations[identity]
                else:
                    error_count += 1
                    if len(errors) < 50:
                        errors.append(
                            {
                                "row": row_numbers[identity],
                                "message": "Conflicting observation for this location, date and disease; edit the existing record",
                            }
                        )
        if errors:
            raise HTTPException(
                422,
                {
                    "message": "Nothing was imported. Fix the invalid rows and try again.",
                    "error_count": error_count,
                    "errors": errors,
                },
            )
        for key, data in pending_locations.items():
            location = Location(**data.model_dump(), name_key=key)
            db.add(location)
            locations[key] = location
        db.flush()
        records = [
            Case(
                **{**observation.model_dump(), "location_id": locations[key].id},
                provenance=classify_provenance(observation.source),
            )
            for (key, _, _), observation in observations.items()
        ]
        for location_id in {row.location_id for row in records}:
            active_location(db, location_id, lock=False)
        validate_intervals(db, records)
        for record in records:
            db.add(record)
            db.flush()
            revision(db, record, None, "import", user_id=user.id)
        batch = ImportBatch(
            filename=Path(file.filename).name[:255], imported=len(observations), skipped=duplicates, user_id=user.id
        )
        db.add(batch)
        evaluate_alerts(db)
        db.commit()
        return {"id": batch.id, "imported": batch.imported, "skipped": batch.skipped, "total": row_count}
    except (UnicodeDecodeError, csv.Error, json.JSONDecodeError):
        db.rollback()
        raise HTTPException(422, "Invalid CSV or mapping. Use UTF-8 CSV with consistent columns.") from None
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Data changed during import. Refresh and retry; nothing was imported.") from None
    finally:
        file.file.close()
