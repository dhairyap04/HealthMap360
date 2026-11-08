from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy import update as sql_update
from sqlalchemy.orm import Session, selectinload

from app.auth.security import analyst, current_user
from app.db.session import get_db
from app.models.models import Case, Location, Outbreak, OutbreakUpdate, User
from app.schemas.health import CaseOut, LocationOut
from app.schemas.surveillance import CaseLinks, OutbreakInput, OutbreakNote
from app.services.surveillance import add_update, revision, snapshot, validate_link

router = APIRouter(prefix="/outbreaks", tags=["outbreaks"], dependencies=[Depends(current_user)])


def get_outbreak(db, outbreak_id, lock=False):
    outbreak = (
        db.scalar(select(Outbreak).where(Outbreak.id == outbreak_id).with_for_update())
        if lock
        else db.get(Outbreak, outbreak_id)
    )
    if not outbreak:
        raise HTTPException(404, "Outbreak not found")
    return outbreak


def outbreak_json(db, outbreak):
    count, total = db.execute(
        select(func.count(Case.id), func.coalesce(func.sum(Case.case_count), 0)).where(Case.outbreak_id == outbreak.id)
    ).one()
    return {
        **{
            key: getattr(outbreak, key)
            for key in (
                "id",
                "title",
                "disease",
                "status",
                "priority",
                "started_on",
                "ended_on",
                "description",
                "owner_id",
                "created_at",
                "updated_at",
            )
        },
        "owner": outbreak.owner.username,
        "locations": [LocationOut.model_validate(loc) for loc in outbreak.locations],
        "observations": count,
        "reported_cases": total,
    }


def apply_outbreak(db, outbreak, data, user):
    locations = db.scalars(select(Location).where(Location.id.in_(data.location_ids))).all()
    if len(locations) != len(data.location_ids):
        raise HTTPException(422, "One or more locations do not exist")
    owner = db.get(User, data.owner_id or outbreak.owner_id or user.id)
    if not owner or owner.role not in ("analyst", "admin"):
        raise HTTPException(422, "Choose an analyst or administrator as owner")
    for key, value in data.model_dump(exclude={"location_ids", "owner_id"}).items():
        setattr(outbreak, key, value)
    outbreak.owner_id = owner.id
    outbreak.locations = locations


@router.get("")
def list_outbreaks(status: str | None = None, disease: str | None = None, db: Session = Depends(get_db)):
    query = (
        select(Outbreak)
        .options(selectinload(Outbreak.locations), selectinload(Outbreak.owner))
        .order_by(Outbreak.updated_at.desc(), Outbreak.id.desc())
    )
    if status:
        if status not in ("investigating", "active", "contained", "closed"):
            raise HTTPException(422, "Unknown outbreak status")
        query = query.where(Outbreak.status == status)
    if disease:
        query = query.where(Outbreak.disease == disease.strip().lower())
    return [outbreak_json(db, row) for row in db.scalars(query)]


@router.post("", status_code=201)
def create(data: OutbreakInput, user: User = Depends(analyst), db: Session = Depends(get_db)):
    outbreak = Outbreak(owner_id=user.id)
    apply_outbreak(db, outbreak, data, user)
    db.add(outbreak)
    db.flush()
    add_update(db, outbreak, user.id, "Investigation created.", "created")
    db.commit()
    return outbreak_json(db, outbreak)


@router.get("/owners")
def eligible_owners(db: Session = Depends(get_db)):
    return [
        {"id": user.id, "username": user.username}
        for user in db.scalars(select(User).where(User.role.in_(["analyst", "admin"])).order_by(User.username))
    ]


@router.get("/{outbreak_id}")
def detail(outbreak_id: int, db: Session = Depends(get_db)):
    outbreak = get_outbreak(db, outbreak_id)
    updates = db.scalars(
        select(OutbreakUpdate)
        .options(selectinload(OutbreakUpdate.user))
        .where(OutbreakUpdate.outbreak_id == outbreak_id)
        .order_by(OutbreakUpdate.id.desc())
        .limit(200)
    ).all()
    trend = db.execute(
        select(Case.date, func.sum(Case.case_count))
        .where(Case.outbreak_id == outbreak_id)
        .group_by(Case.date)
        .order_by(Case.date)
    ).all()
    return {
        "trend": [{"date": str(day), "cases": count} for day, count in trend],
        **outbreak_json(db, outbreak),
        "updates": [
            {"id": u.id, "body": u.body, "kind": u.kind, "username": u.user.username, "created_at": u.created_at}
            for u in updates
        ],
    }


@router.put("/{outbreak_id}")
def update(outbreak_id: int, data: OutbreakInput, user: User = Depends(analyst), db: Session = Depends(get_db)):
    outbreak = get_outbreak(db, outbreak_id, lock=True)
    previous_status = outbreak.status
    apply_outbreak(db, outbreak, data, user)
    db.flush()
    for observation in db.scalars(select(Case).where(Case.outbreak_id == outbreak_id)):
        validate_link(db, outbreak_id, observation)
    note = (
        f"Status changed from {previous_status} to {outbreak.status}."
        if previous_status != outbreak.status
        else "Investigation details updated."
    )
    add_update(db, outbreak, user.id, note, "status" if previous_status != outbreak.status else "updated")
    db.commit()
    return outbreak_json(db, outbreak)


@router.post("/{outbreak_id}/updates", status_code=201)
def note(outbreak_id: int, data: OutbreakNote, user: User = Depends(analyst), db: Session = Depends(get_db)):
    outbreak = get_outbreak(db, outbreak_id)
    add_update(db, outbreak, user.id, data.body)
    db.commit()
    return {"status": "saved"}


@router.get("/{outbreak_id}/observations")
def observations(outbreak_id: int, candidates: bool = False, page: int = Query(1, ge=1), db: Session = Depends(get_db)):
    outbreak = get_outbreak(db, outbreak_id)
    filters = [Case.outbreak_id == outbreak.id]
    if candidates:
        filters = [
            Case.outbreak_id.is_(None),
            Case.disease == outbreak.disease,
            Case.location_id.in_([loc.id for loc in outbreak.locations]),
            Case.date >= outbreak.started_on,
        ]
        if outbreak.ended_on:
            filters.append(Case.date <= outbreak.ended_on)
    total = db.scalar(select(func.count(Case.id)).where(*filters))
    rows = db.scalars(
        select(Case)
        .options(selectinload(Case.location))
        .where(*filters)
        .order_by(Case.date.desc(), Case.id)
        .offset((page - 1) * 50)
        .limit(50)
    ).all()
    return {"items": [CaseOut.model_validate(row) for row in rows], "total": total, "page": page, "page_size": 50}


@router.post("/{outbreak_id}/observations")
def link(outbreak_id: int, data: CaseLinks, user: User = Depends(analyst), db: Session = Depends(get_db)):
    outbreak = get_outbreak(db, outbreak_id, lock=True)
    if outbreak.status == "closed":
        raise HTTPException(409, "Reopen the investigation before changing linked observations")
    ids = set(data.observation_ids)
    records = db.scalars(select(Case).where(Case.id.in_(ids))).all()
    if len(records) != len(ids):
        raise HTTPException(422, "One or more observations do not exist")
    for observation in records:
        if data.action == "attach":
            validate_link(db, outbreak_id, observation)
            if observation.outbreak_id not in (None, outbreak_id):
                raise HTTPException(409, "An observation already belongs to another outbreak")
        elif observation.outbreak_id != outbreak_id:
            raise HTTPException(409, "An observation is not linked to this outbreak")
    for observation in records:
        before = snapshot(observation)
        eligible = (
            or_(Case.outbreak_id.is_(None), Case.outbreak_id == outbreak_id)
            if data.action == "attach"
            else Case.outbreak_id == outbreak_id
        )
        changed = db.execute(
            sql_update(Case)
            .where(Case.id == observation.id, eligible)
            .values(outbreak_id=outbreak_id if data.action == "attach" else None)
        )
        if changed.rowcount != 1:
            raise HTTPException(409, "Observation assignment changed. Refresh and retry.")
        revision(db, observation, before, "link" if data.action == "attach" else "unlink", user_id=user.id)
    add_update(
        db,
        outbreak,
        user.id,
        f"{len(records)} observation(s) {'linked' if data.action == 'attach' else 'unlinked'}.",
        "observations",
    )
    db.commit()
    return {"changed": len(records)}
