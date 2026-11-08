import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.auth.security import analyst, current_user
from app.db.session import get_db
from app.models.models import Alert, Case, CaseRevision, Feed, Location, Outbreak, Resource, User
from app.schemas.health import CaseInput, CaseOut, LocationInput, LocationOut, ResourceInput, ResourceOut
from app.services.alerts import evaluate_alerts
from app.services.geocoding import search_places
from app.services.surveillance import revision, snapshot, validate_link

router = APIRouter(tags=["data"], dependencies=[Depends(current_user)])
SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}


def normalize_name(name: str):
    return " ".join(name.split()).casefold()


def case_filters(
    date_from: date | None = None,
    date_to: date | None = None,
    disease: str | None = Query(None, max_length=120),
    severity: str | None = None,
    location_id: int | None = Query(None, gt=0),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "Start date must be before end date")
    if severity and severity not in SEVERITY_ORDER:
        raise HTTPException(422, "Unknown severity")
    filters = []
    for value, clause in [
        (date_from, lambda: Case.date >= date_from),
        (date_to, lambda: Case.date <= date_to),
        (disease, lambda: Case.disease == " ".join(disease.split()).lower()),
        (severity, lambda: Case.severity == severity),
        (location_id, lambda: Case.location_id == location_id),
    ]:
        if value is not None:
            filters.append(clause())
    return filters


def save(db, obj):
    db.add(obj)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A record with this location/name/disease/date already exists or is invalid") from None
    db.refresh(obj)
    return obj


@router.get("/locations", response_model=list[LocationOut])
def locations(db: Session = Depends(get_db)):
    return db.scalars(select(Location).order_by(Location.name)).all()


@router.get("/locations/search", dependencies=[Depends(analyst)])
def find_places(q: str = Query(min_length=3, max_length=200)):
    query = " ".join(q.split())
    if len(query) < 3:
        raise HTTPException(422, "Enter at least 3 characters to search for a place")
    return {"results": search_places(query), "attribution": "© OpenStreetMap contributors", "provider": "Nominatim"}


@router.post("/locations", response_model=LocationOut, status_code=201, dependencies=[Depends(analyst)])
def create_location(data: LocationInput, db: Session = Depends(get_db)):
    return save(db, Location(**data.model_dump(), name_key=normalize_name(data.name)))


@router.put("/locations/{location_id}", response_model=LocationOut, dependencies=[Depends(analyst)])
def update_location(location_id: int, data: LocationInput, db: Session = Depends(get_db)):
    location = db.get(Location, location_id)
    if not location:
        raise HTTPException(404, "Location not found")
    for key, value in data.model_dump().items():
        setattr(location, key, value)
    location.name_key = normalize_name(data.name)
    return save(db, location)


@router.get("/diseases", response_model=list[str])
def diseases(db: Session = Depends(get_db)):
    return db.scalars(select(Case.disease).distinct().order_by(Case.disease)).all()


@router.get("/cases")
def cases(
    filters: list = Depends(case_filters),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    total = db.scalar(select(func.count(Case.id)).where(*filters))
    rows = db.scalars(
        select(Case)
        .options(joinedload(Case.location))
        .where(*filters)
        .order_by(Case.date.desc(), Case.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [CaseOut.model_validate(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def csv_safe(value):
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


@router.get("/cases/export")
def export_cases(filters: list = Depends(case_filters), db: Session = Depends(get_db)):
    def generate():
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "date",
                "location",
                "disease",
                "case_count",
                "severity",
                "source",
                "latitude",
                "longitude",
                "reporting_period_days",
            ]
        )
        yield buffer.getvalue()
        query = select(Case).options(joinedload(Case.location)).where(*filters).order_by(Case.date, Case.id)
        for row in db.scalars(query.execution_options(yield_per=500)):
            buffer.seek(0)
            buffer.truncate(0)
            writer.writerow(
                [
                    csv_safe(v)
                    for v in [
                        row.date.isoformat(),
                        row.location.name,
                        row.disease,
                        row.case_count,
                        row.severity,
                        row.source or "",
                        row.location.latitude,
                        row.location.longitude,
                        row.reporting_period_days,
                    ]
                ]
            )
            yield buffer.getvalue()

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="healthmap360-cases.csv"'},
    )


def save_observation(db, observation, before, action, user):
    try:
        db.add(observation)
        db.flush()
        revision(db, observation, before, action, user_id=user.id)
        evaluate_alerts(db)
        db.commit()
        db.refresh(observation)
        return observation
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An observation already exists for this location, disease and date") from None


@router.post("/cases", response_model=CaseOut, status_code=201)
def create_case(data: CaseInput, user: User = Depends(analyst), db: Session = Depends(get_db)):
    if not db.get(Location, data.location_id):
        raise HTTPException(422, "Location not found")
    return save_observation(db, Case(**data.model_dump()), None, "create", user)


@router.get("/cases/{case_id}/history")
def case_history(case_id: int, db: Session = Depends(get_db)):
    return [
        {
            "id": row.id,
            "action": row.action,
            "before": row.before,
            "after": row.after,
            "user_id": row.user_id,
            "feed_id": row.feed_id,
            "created_at": row.created_at,
        }
        for row in db.scalars(
            select(CaseRevision).where(CaseRevision.case_id == case_id).order_by(CaseRevision.id.desc()).limit(100)
        )
    ]


@router.put("/cases/{case_id}", response_model=CaseOut)
def update_case(case_id: int, data: CaseInput, user: User = Depends(analyst), db: Session = Depends(get_db)):
    observation = db.get(Case, case_id)
    if not observation:
        raise HTTPException(404, "Case observation not found")
    if not db.get(Location, data.location_id):
        raise HTTPException(422, "Location not found")
    validate_link(db, observation.outbreak_id, data)
    before = snapshot(observation)
    for key, value in data.model_dump().items():
        setattr(observation, key, value)
    # An explicit analyst correction takes ownership; a feed cannot overwrite it.
    observation.feed_id = None
    return save_observation(db, observation, before, "update", user)


@router.delete("/cases/{case_id}", status_code=204)
def delete_case(case_id: int, user: User = Depends(analyst), db: Session = Depends(get_db)):
    observation = db.get(Case, case_id)
    if not observation:
        raise HTTPException(404, "Case observation not found")
    revision(db, observation, snapshot(observation), "delete", user_id=user.id)
    db.delete(observation)
    evaluate_alerts(db)
    db.commit()


@router.get("/monitoring")
def monitoring(db: Session = Depends(get_db)):
    return {
        "open_alerts": db.scalar(select(func.count(Alert.id)).where(Alert.status == "open")),
        "active_outbreaks": db.scalar(select(func.count(Outbreak.id)).where(Outbreak.status != "closed")),
        "enabled_feeds": db.scalar(select(func.count(Feed.id)).where(Feed.enabled.is_(True))),
        "failed_feeds": db.scalar(
            select(func.count(Feed.id)).where(Feed.enabled.is_(True), Feed.last_error.is_not(None))
        ),
    }


@router.get("/summary")
def summary(
    filters: list = Depends(case_filters), location_id: int | None = Query(None, gt=0), db: Session = Depends(get_db)
):
    totals = db.execute(
        select(
            func.coalesce(func.sum(Case.case_count), 0),
            func.count(Case.id),
            func.count(func.distinct(Case.location_id)),
            func.count(func.distinct(Case.disease)),
        ).where(*filters)
    ).one()
    trend = db.execute(
        select(Case.date, func.sum(Case.case_count)).where(*filters).group_by(Case.date).order_by(Case.date)
    ).all()
    disease_rows = db.execute(
        select(Case.disease, func.sum(Case.case_count))
        .where(*filters)
        .group_by(Case.disease)
        .order_by(func.sum(Case.case_count).desc())
    ).all()
    severity_rows = db.execute(
        select(Case.severity, func.sum(Case.case_count)).where(*filters).group_by(Case.severity)
    ).all()
    ranks = case(SEVERITY_ORDER, value=Case.severity, else_=0)
    hotspots = db.execute(
        select(
            Location.id,
            Location.name,
            Location.latitude,
            Location.longitude,
            func.sum(Case.case_count),
            func.max(ranks),
        )
        .join(Case)
        .where(*filters)
        .group_by(Location.id, Location.name, Location.latitude, Location.longitude)
        .order_by(func.sum(Case.case_count).desc())
    ).all()
    resource_query = select(func.coalesce(func.sum(Resource.quantity), 0))
    if location_id:
        resource_query = resource_query.where(Resource.location_id == location_id)
    return {
        "total_cases": totals[0],
        "observations": totals[1],
        "affected_locations": totals[2],
        "diseases": totals[3],
        "resource_units": db.scalar(resource_query),
        "trend": [{"date": str(d), "cases": n} for d, n in trend],
        "by_disease": [{"disease": d, "cases": n} for d, n in disease_rows],
        "by_severity": [{"severity": s, "cases": n} for s, n in severity_rows],
        "locations": [
            {"id": i, "name": n, "latitude": lat, "longitude": lon, "cases": c, "severity": list(SEVERITY_ORDER)[rank]}
            for i, n, lat, lon, c, rank in hotspots
        ],
    }


@router.get("/resources", response_model=list[ResourceOut])
def resources(location_id: int | None = Query(None, gt=0), db: Session = Depends(get_db)):
    query = select(Resource).options(joinedload(Resource.location)).order_by(Resource.type, Resource.id)
    if location_id:
        query = query.where(Resource.location_id == location_id)
    return db.scalars(query).all()


def validate_resource(data, db):
    if data.location_id is not None and not db.get(Location, data.location_id):
        raise HTTPException(422, "Location not found")
    if data.location_id is None and data.allocated_date is not None:
        raise HTTPException(422, "An allocation date requires a location")


@router.post("/resources", response_model=ResourceOut, status_code=201, dependencies=[Depends(analyst)])
def create_resource(data: ResourceInput, db: Session = Depends(get_db)):
    validate_resource(data, db)
    return save(db, Resource(**data.model_dump()))


@router.put("/resources/{resource_id}", response_model=ResourceOut, dependencies=[Depends(analyst)])
def update_resource(resource_id: int, data: ResourceInput, db: Session = Depends(get_db)):
    resource = db.get(Resource, resource_id)
    if not resource:
        raise HTTPException(404, "Resource not found")
    validate_resource(data, db)
    for key, value in data.model_dump().items():
        setattr(resource, key, value)
    return save(db, resource)


@router.delete("/resources/{resource_id}", status_code=204, dependencies=[Depends(analyst)])
def delete_resource(resource_id: int, db: Session = Depends(get_db)):
    resource = db.get(Resource, resource_id)
    if not resource:
        raise HTTPException(404, "Resource not found")
    db.delete(resource)
    db.commit()
