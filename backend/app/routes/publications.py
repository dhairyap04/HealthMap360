"""Explicit reviewed snapshots are the only public data boundary."""

import hashlib
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, HttpUrl, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import admin, analyst
from app.db.session import get_db
from app.models.models import Case, Location, Outbreak, Publication, PublicationEvent, User
from app.services.observations import lock_locations
from app.services.surveillance import utcnow

router = APIRouter(prefix="/publications", tags=["publication review"], dependencies=[Depends(analyst)])
public = APIRouter(prefix="/public", tags=["published information"])


class Draft(BaseModel):
    location_id: int = Field(gt=0)
    outbreak_id: int | None = Field(default=None, gt=0)
    disease: str = Field(min_length=1, max_length=120)
    date_from: date
    date_to: date
    title: str = Field(min_length=5, max_length=200)
    public_name: str = Field(min_length=2, max_length=200)
    summary: str = Field(min_length=10, max_length=5000)
    methodology: str = Field(min_length=20, max_length=5000)
    source_name: str = Field(min_length=3, max_length=200)
    source_url: HttpUrl
    suppression_threshold: int = Field(default=5, ge=5, le=100)

    @model_validator(mode="after")
    def valid(self):
        self.disease = " ".join(self.disease.split()).lower()
        if not self.disease or self.date_from > self.date_to or self.date_to > date.today():
            raise ValueError("Choose a valid disease and historical/present reporting range")
        if any(
            not value.strip()
            for value in (self.title, self.public_name, self.summary, self.methodology, self.source_name)
        ):
            raise ValueError("Public text must not be blank")
        if self.source_url.scheme != "https" or self.source_url.username or self.source_url.password:
            raise ValueError("Use an HTTPS source URL without embedded credentials")
        if len(str(self.source_url)) > 500:
            raise ValueError("Source URL must be at most 500 characters")
        return self


class Decision(BaseModel):
    reviewed: bool


def build_snapshot(db, data):
    location = db.get(Location, data.location_id)
    if location and location.archived_at:
        raise HTTPException(409, "Restore this archived location before preparing or publishing a new snapshot")
    if not location or location.geographic_scope == "unclassified":
        raise HTTPException(422, "Choose a classified reporting area")
    outbreak = db.get(Outbreak, data.outbreak_id) if data.outbreak_id else None
    if data.outbreak_id and (
        not outbreak or outbreak.disease != data.disease or location.id not in {loc.id for loc in outbreak.locations}
    ):
        raise HTTPException(422, "Investigation does not match this disease and reporting area")
    filters = [
        Case.location_id == location.id,
        Case.disease == data.disease,
        Case.date >= data.date_from,
        Case.date <= data.date_to,
    ]
    if outbreak:
        filters.append(Case.outbreak_id == outbreak.id)
    rows = list(db.scalars(select(Case).where(*filters).order_by(Case.date).limit(2001)))
    if len(rows) > 2000:
        raise HTTPException(422, "Use a narrower range; a public snapshot supports at most 2,000 reports")
    if not rows:
        raise HTTPException(422, "No observations in this reporting range")
    if any(row.quality_status != "valid" or row.provenance == "demo" for row in rows):
        raise HTTPException(409, "Demonstration data and unresolved reporting-period conflicts cannot be published")
    reports = [
        {
            "date": str(row.date),
            "cases": row.case_count if row.case_count == 0 or row.case_count >= data.suppression_threshold else None,
            "reporting_period_days": row.reporting_period_days,
        }
        for row in rows
    ]
    suppressed = any(row["cases"] is None for row in reports)
    payload = {
        "location": {
            "id": location.id,
            "name": data.public_name,
            "geographic_scope": location.geographic_scope,
            "country_code": location.country_code,
            "region_code": location.region_code,
        },
        "title": data.title,
        "summary": data.summary,
        "methodology": data.methodology,
        "source_name": data.source_name,
        "source_url": str(data.source_url),
        "disease": data.disease,
        "date_from": str(data.date_from),
        "date_to": str(data.date_to),
        "latest_report_date": str(rows[-1].date),
        "reporting_periods": sorted({row.reporting_period_days for row in rows}),
        "reports": reports,
        "total_cases": None if suppressed else sum(row.case_count for row in rows),
        "suppression_threshold": data.suppression_threshold,
        "suppressed": suppressed,
        "investigation_status": outbreak.status if outbreak else None,
        "note": "Reviewed publication snapshot. Counts are reported observations, not active infections. Missing reports are not zero. Small counts and any totals that could reveal them are withheld.",
    }
    # The fingerprint is private; IDs, ownership, private source strings and notes never reach public responses.
    evidence = {
        "location": [
            location.name,
            location.latitude,
            location.longitude,
            location.administrative_level,
            location.country_code,
            location.region_code,
        ],
        "records": [(row.id, row.version, row.case_count, row.quality_status, row.provenance) for row in rows],
        "status": outbreak.status if outbreak else None,
    }
    fingerprint = hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest()
    return payload, fingerprint


def draft_data(row):
    return Draft(**{key: getattr(row, key) for key in Draft.model_fields})


def internal_json(row):
    return {
        "id": row.id,
        "status": row.status,
        "location_id": row.location_id,
        "outbreak_id": row.outbreak_id,
        "payload": row.payload,
        "created_at": row.created_at,
        "published_at": row.published_at,
    }


@router.get("")
def drafts(db: Session = Depends(get_db), limit: int = Query(50, ge=1, le=100)):
    return [internal_json(row) for row in db.scalars(select(Publication).order_by(Publication.id.desc()).limit(limit))]


@router.post("", status_code=201)
def create(data: Draft, user: User = Depends(analyst), db: Session = Depends(get_db)):
    lock_locations(db, [data.location_id])
    payload, fingerprint = build_snapshot(db, data)
    row = Publication(
        **{**data.model_dump(), "source_url": str(data.source_url)},
        payload=payload,
        fingerprint=fingerprint,
        created_by=user.id,
    )
    db.add(row)
    db.flush()
    db.add(PublicationEvent(publication_id=row.id, user_id=user.id, action="draft_created"))
    db.commit()
    return internal_json(row)


@router.post("/{publication_id}/publish")
def publish(publication_id: int, data: Decision, user: User = Depends(admin), db: Session = Depends(get_db)):
    row = db.get(Publication, publication_id)
    if not row:
        raise HTTPException(404, "Publication not found")
    lock_locations(db, [row.location_id])
    db.refresh(row)
    if row.status != "draft":
        raise HTTPException(409, "Create a new reviewed draft to publish a new snapshot")
    if not data.reviewed:
        raise HTTPException(422, "Confirm source, publication text, reporting area and small-count privacy review")
    _, fingerprint = build_snapshot(db, draft_data(row))
    if fingerprint != row.fingerprint:
        raise HTTPException(409, "Source records or reporting geography changed. Create and review a fresh draft.")
    previous = db.scalars(
        select(Publication).where(
            Publication.location_id == row.location_id,
            Publication.disease == row.disease,
            Publication.status == "published",
            Publication.outbreak_id == row.outbreak_id,
        )
    ).all()
    for old in previous:
        old.status = "withdrawn"
        db.add(PublicationEvent(publication_id=old.id, user_id=user.id, action="superseded"))
    row.status = "published"
    row.published_by = user.id
    row.published_at = utcnow()
    db.add(PublicationEvent(publication_id=row.id, user_id=user.id, action="published"))
    db.commit()
    return internal_json(row)


@router.post("/{publication_id}/withdraw")
def withdraw(publication_id: int, user: User = Depends(admin), db: Session = Depends(get_db)):
    row = db.get(Publication, publication_id)
    if not row:
        raise HTTPException(404, "Publication not found")
    lock_locations(db, [row.location_id])
    db.refresh(row)
    row.status = "withdrawn"
    db.add(PublicationEvent(publication_id=row.id, user_id=user.id, action="withdrawn"))
    db.commit()
    return internal_json(row)


@router.get("/{publication_id}/history")
def history(publication_id: int, db: Session = Depends(get_db)):
    return [
        {"action": event.action, "created_at": event.created_at, "user_id": event.user_id}
        for event in db.scalars(
            select(PublicationEvent)
            .where(PublicationEvent.publication_id == publication_id)
            .order_by(PublicationEvent.id)
        )
    ]


def public_json(row):
    return {
        "id": row.id,
        **row.payload,
        "published_at": row.published_at,
        "historical": (date.today() - date.fromisoformat(row.payload["latest_report_date"])).days > 30,
    }


@public.get("/reports")
def public_reports(
    location_id: int | None = Query(None, gt=0),
    disease: str | None = Query(None, max_length=120),
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
):
    statement = select(Publication).where(Publication.status == "published")
    if location_id:
        statement = statement.where(Publication.location_id == location_id)
    if disease:
        statement = statement.where(Publication.disease == disease.strip().lower())
    rows = db.scalars(
        statement.order_by(Publication.published_at.desc(), Publication.id.desc()).offset((page - 1) * 20).limit(21)
    ).all()
    return {"items": [public_json(row) for row in rows[:20]], "page": page, "has_more": len(rows) > 20}


@public.get("/reports/{publication_id}")
def public_report(publication_id: int, db: Session = Depends(get_db)):
    row = db.get(Publication, publication_id)
    if not row or row.status != "published":
        raise HTTPException(404, "Published report not found")
    return public_json(row)


@public.get("/config")
def reporting_clock():
    return {
        "today": date.today(),
        "note": "Date inputs use the workspace reporting day, independently of browser UTC conversion.",
    }
