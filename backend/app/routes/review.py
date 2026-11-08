"""A focused private weekly surveillance workflow for the regional analyst pilot."""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import analyst
from app.db.session import get_db
from app.models.models import Case, Location, Outbreak, outbreak_locations
from app.services import laboratory
from app.services.geography import scope_expression
from app.services.surveillance import utcnow
from app.services.weekly_review import area_review

router = APIRouter(prefix="/review", tags=["weekly review"], dependencies=[Depends(analyst)])


def review_date(value):
    end = value or date.today() - timedelta(days=(date.today().weekday() + 2) % 7)
    if end > date.today():
        raise HTTPException(422, "Reporting week cannot end in the future")
    return end


@router.get("/weekly")
def weekly(
    disease: str = Query(default="covid-19", min_length=1, max_length=120),
    geographic_scope: Literal["local", "regional", "national"] = "regional",
    country_code: str | None = Query(default="CA", pattern=r"^[A-Z]{2}$"),
    location_id: int | None = Query(default=None, gt=0),
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    disease = " ".join(disease.lower().split())
    if not disease:
        raise HTTPException(422, "Choose one disease for a comparable weekly review")
    end = review_date(date_to)
    filters = [Location.archived_at.is_(None), scope_expression() == geographic_scope]
    if country_code:
        filters.append(Location.country_code == country_code)
    if location_id:
        filters.append(Location.id == location_id)
    locations = list(db.scalars(select(Location).where(*filters).order_by(Location.name, Location.id).limit(501)))
    truncated = len(locations) > 500
    locations = locations[:500]
    ids = [location.id for location in locations]
    # Include intervals straddling either edge, so they block comparison instead of disappearing.
    rows = list(
        db.scalars(
            select(Case).where(
                Case.location_id.in_(ids),
                Case.disease == disease,
                Case.date >= end - timedelta(days=13),
                Case.date <= end + timedelta(days=6),
            )
        )
    )
    by_location = {location.id: [] for location in locations}
    for row in rows:
        by_location[row.location_id].append(row)
    areas = [area_review(location, by_location[location.id], end) for location in locations]
    for area in areas:
        area["investigations"] = [
            {"id": row.id, "title": row.title, "status": row.status, "owner_id": row.owner_id}
            for row in db.scalars(
                select(Outbreak)
                .join(outbreak_locations)
                .where(
                    outbreak_locations.c.location_id == area["location_id"],
                    Outbreak.disease == disease,
                    Outbreak.status != "closed",
                )
                .order_by(Outbreak.id.desc())
                .limit(20)
            )
        ]
    return {
        "generated_at": utcnow(),
        "disease": disease,
        "geographic_scope": geographic_scope,
        "date_from": end - timedelta(days=6),
        "date_to": end,
        "historical": (date.today() - end).days > 30,
        "areas": areas,
        "truncated": truncated,
        "note": "Private working review. Counts are reported cases, not active infections or clinical severity. Comparisons require complete matching source/cadence coverage; this does not establish unchanged testing practices. Areas are never summed. Rates use confirmed same-year denominators and are not age-standardized. Review source definitions before acting or publishing.",
    }


@router.get("/laboratory")
def lab_context(location_id: int = Query(gt=0), date_to: date | None = None, db: Session = Depends(get_db)):
    end = review_date(date_to)
    location = db.get(Location, location_id)
    if not location or location.archived_at:
        raise HTTPException(404, "Active reporting area not found")
    if (
        location.geographic_scope != "regional"
        or location.country_code != "CA"
        or location.region_code not in laboratory.PROVINCES
    ):
        raise HTTPException(422, "Select a Canadian province or territory with a region identifier in Settings.")
    rows, retrieved_at = laboratory.load_laboratory()
    return laboratory.laboratory_context(location, end, rows, retrieved_at)
