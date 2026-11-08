from datetime import datetime, timezone

from fastapi import HTTPException

from app.models.models import CaseRevision, Outbreak, OutbreakUpdate


def utcnow():
    return datetime.now(timezone.utc)


def snapshot(observation):
    return {
        "id": observation.id,
        "location_id": observation.location_id,
        "date": str(observation.date),
        "disease": observation.disease,
        "case_count": observation.case_count,
        "severity": observation.severity,
        "source": observation.source,
        "reporting_period_days": observation.reporting_period_days,
        "feed_id": observation.feed_id,
        "outbreak_id": observation.outbreak_id,
    }


def revision(db, observation, before, action, user_id=None, feed_id=None):
    db.add(
        CaseRevision(
            case_id=None if action == "delete" else observation.id,
            user_id=user_id,
            feed_id=feed_id,
            action=action,
            before=before,
            after=None if action == "delete" else snapshot(observation),
        )
    )


def validate_link(db, outbreak_id, observation):
    if not outbreak_id:
        return
    outbreak = db.get(Outbreak, outbreak_id)
    if (
        not outbreak
        or observation.disease != outbreak.disease
        or observation.location_id not in {loc.id for loc in outbreak.locations}
        or observation.date < outbreak.started_on
        or (outbreak.ended_on and observation.date > outbreak.ended_on)
    ):
        raise HTTPException(
            409, "Observation falls outside its outbreak's disease, locations or dates. Unlink it first."
        )


def add_update(db, outbreak, user_id, body, kind="note"):
    outbreak.updated_at = utcnow()
    db.add(OutbreakUpdate(outbreak_id=outbreak.id, user_id=user_id, body=body, kind=kind))
