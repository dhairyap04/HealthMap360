from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth.security import analyst
from app.db.session import get_db
from app.models.models import Feed, FeedRun, User, WorkerHeartbeat
from app.schemas.surveillance import FeedInput
from app.services import feeds as feed_service
from app.services.feeds import catalog, parse_reports, sync_feed, validate_feed
from app.services.surveillance import utcnow

router = APIRouter(prefix="/feeds", tags=["feeds"], dependencies=[Depends(analyst)])


def feed_json(feed):
    return {
        **{
            key: getattr(feed, key)
            for key in (
                "id",
                "name",
                "provider",
                "country_code",
                "location_id",
                "severity",
                "start_date",
                "interval_minutes",
                "enabled",
                "next_sync_at",
                "last_synced_at",
                "last_error",
                "lease_until",
            )
        },
        "location_name": feed.location.name,
    }


def run_json(run):
    return {
        key: getattr(run, key)
        for key in (
            "id",
            "feed_id",
            "status",
            "imported",
            "updated",
            "skipped",
            "latest_report_date",
            "message",
            "started_at",
            "finished_at",
        )
    }


@router.get("/worker-status")
def worker_status(db: Session = Depends(get_db)):
    heartbeat = db.get(WorkerHeartbeat, "scheduler")
    tick = heartbeat.last_tick_at if heartbeat else None
    aware = tick.replace(tzinfo=utcnow().tzinfo) if tick and tick.tzinfo is None else tick
    return {"last_tick_at": tick, "online": bool(aware and utcnow() - aware < timedelta(minutes=5))}


@router.get("/catalog", dependencies=[Depends(analyst)])
def providers():
    return catalog()


@router.post("/preview", dependencies=[Depends(analyst)])
def preview(data: FeedInput, db: Session = Depends(get_db)):
    validate_feed(db, data)
    try:
        observations, latest = parse_reports(feed_service.load_who_rows(), data.country_code, data.start_date)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    return {
        "records": len(observations),
        "reported_cases": sum(observations.values()),
        "first_report": min(observations) if observations else None,
        "last_report": max(observations) if observations else None,
        "latest_source_report": latest,
        "historical": (utcnow().date() - latest).days > 30,
        "reporting_period_days": 7,
        "geographic_scope": "national",
        "assessment": "unassessed",
        "source": "WHO COVID-19 weekly country reports",
        "note": "Source snapshot; existing observations and overlaps are checked again during sync. No data has been saved.",
    }


@router.get("")
def feeds(db: Session = Depends(get_db)):
    return [
        feed_json(feed)
        for feed in db.scalars(select(Feed).options(selectinload(Feed.location)).order_by(Feed.id.desc()))
    ]


@router.post("", status_code=201)
def connect(data: FeedInput, user: User = Depends(analyst), db: Session = Depends(get_db)):
    validate_feed(db, data)
    feed = Feed(**data.model_dump(), created_by=user.id, next_sync_at=utcnow())
    db.add(feed)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This source country is already connected. Edit the existing feed instead.") from None
    return feed_json(feed)


@router.put("/{feed_id}", dependencies=[Depends(analyst)])
def update_feed(feed_id: int, data: FeedInput, db: Session = Depends(get_db)):
    feed = db.get(Feed, feed_id)
    if not feed:
        raise HTTPException(404, "Feed not found")
    if (
        feed.lease_until
        and (feed.lease_until.replace(tzinfo=utcnow().tzinfo) if feed.lease_until.tzinfo is None else feed.lease_until)
        > utcnow()
    ):
        raise HTTPException(409, "Wait for the current sync to finish")
    if (data.provider, data.country_code, data.location_id) != (feed.provider, feed.country_code, feed.location_id):
        raise HTTPException(
            422,
            "Source country and target location cannot change after connection. Pause this feed and create another.",
        )
    for key, value in data.model_dump().items():
        setattr(feed, key, value)
    feed.next_sync_at = utcnow()
    db.commit()
    return feed_json(feed)


@router.post("/{feed_id}/sync", dependencies=[Depends(analyst)])
def sync(feed_id: int, db: Session = Depends(get_db)):
    if not db.get(Feed, feed_id):
        raise HTTPException(404, "Feed not found")
    return run_json(sync_feed(db, feed_id, force=True))


@router.get("/{feed_id}/runs")
def runs(feed_id: int, limit: int = Query(30, ge=1, le=100), db: Session = Depends(get_db)):
    if not db.get(Feed, feed_id):
        raise HTTPException(404, "Feed not found")
    return [
        run_json(run)
        for run in db.scalars(
            select(FeedRun).where(FeedRun.feed_id == feed_id).order_by(FeedRun.id.desc()).limit(limit)
        )
    ]
