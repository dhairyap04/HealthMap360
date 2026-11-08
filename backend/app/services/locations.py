"""Reporting area lifecycle: preserve linked history and make archive reversible."""

from fastapi import HTTPException
from sqlalchemy import func, or_, select

from app.models.models import (
    Alert,
    AlertEvaluation,
    AlertRule,
    Case,
    CaseRevision,
    Feed,
    Location,
    LocationEvent,
    Publication,
    Resource,
    outbreak_locations,
)
from app.services.observations import lock_locations
from app.services.surveillance import utcnow


def active_location(db, location_id, *, lock=True):
    if lock:
        lock_locations(db, [location_id])
    location = db.get(Location, location_id, populate_existing=True)
    if not location:
        raise HTTPException(422, "Location not found. Refresh and choose an existing location.")
    if location.archived_at:
        raise HTTPException(
            409, "This location is archived. Restore it in Settings before adding records or enabling monitoring."
        )
    return location


def usage(db, location_id):
    references = {
        name: db.scalar(select(func.count(model.id)).where(model.location_id == location_id))
        for name, model in [
            ("observations", Case),
            ("resources", Resource),
            ("feeds", Feed),
            ("alert_rules", AlertRule),
            ("alerts", Alert),
            ("alert_evaluations", AlertEvaluation),
            ("publications", Publication),
        ]
    }
    references["investigations"] = db.scalar(
        select(func.count()).select_from(outbreak_locations).where(outbreak_locations.c.location_id == location_id)
    )
    references["observation_history"] = db.scalar(
        select(func.count(CaseRevision.id)).where(
            or_(
                CaseRevision.before["location_id"].as_integer() == location_id,
                CaseRevision.after["location_id"].as_integer() == location_id,
            )
        )
    )
    return {"references": references, "can_delete": not any(references.values())}


def event(db, location, user_id, action):
    db.add(
        LocationEvent(
            location_id=location.id,
            user_id=user_id,
            action=action,
            snapshot={
                "name": location.name,
                "country_code": location.country_code,
                "geographic_scope": location.geographic_scope,
                "archived_at": location.archived_at.isoformat() if location.archived_at else None,
            },
        )
    )


def set_archived(db, location_id, user_id, archived):
    lock_locations(db, [location_id])
    location = db.get(Location, location_id, populate_existing=True)
    if not location:
        raise HTTPException(404, "Location not found")
    if bool(location.archived_at) == archived:
        return location
    if archived:
        feeds = list(db.scalars(select(Feed).where(Feed.location_id == location_id)))
        now = utcnow()
        if any(
            feed.lease_until
            and (feed.lease_until.replace(tzinfo=now.tzinfo) if feed.lease_until.tzinfo is None else feed.lease_until)
            > now
            for feed in feeds
        ):
            raise HTTPException(409, "Wait for the current feed sync to finish before archiving this location.")
        location.archived_at = now
        for feed in feeds:
            feed.enabled = False
        for rule in db.scalars(select(AlertRule).where(AlertRule.location_id == location_id)):
            rule.enabled = False
        for alert in db.scalars(select(Alert).where(Alert.location_id == location_id, Alert.status != "resolved")):
            alert.data_state = "archived"
    else:
        location.archived_at = None
    event(db, location, user_id, "archive" if archived else "restore")
    db.commit()
    db.refresh(location)
    return location
