from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth.security import analyst, current_user
from app.db.session import get_db
from app.models.models import Alert, AlertRule, Location, User
from app.schemas.surveillance import AlertAction, AlertRuleInput
from app.services.alerts import evaluate_alerts, retire_rule_alerts
from app.services.surveillance import utcnow

router = APIRouter(tags=["alerts"], dependencies=[Depends(current_user)])


def rule_json(rule):
    return {
        key: getattr(rule, key)
        for key in ("id", "name", "disease", "location_id", "threshold", "window_days", "severity", "enabled")
    }


@router.get("/alert-rules")
def rules(db: Session = Depends(get_db)):
    return [rule_json(rule) for rule in db.scalars(select(AlertRule).order_by(AlertRule.id.desc()))]


@router.post("/alert-rules", status_code=201)
def create_rule(data: AlertRuleInput, user: User = Depends(analyst), db: Session = Depends(get_db)):
    if data.location_id and not db.get(Location, data.location_id):
        raise HTTPException(422, "Location not found")
    rule = AlertRule(**data.model_dump(), user_id=user.id)
    db.add(rule)
    evaluate_alerts(db)
    db.commit()
    return rule_json(rule)


@router.put("/alert-rules/{rule_id}", dependencies=[Depends(analyst)])
def update_rule(rule_id: int, data: AlertRuleInput, db: Session = Depends(get_db)):
    rule = db.get(AlertRule, rule_id)
    if not rule:
        raise HTTPException(404, "Alert rule not found")
    if data.location_id and not db.get(Location, data.location_id):
        raise HTTPException(422, "Location not found")
    retire_rule_alerts(db, rule.id, "Rule changed or paused.")
    for key, value in data.model_dump().items():
        setattr(rule, key, value)
    evaluate_alerts(db)
    db.commit()
    return rule_json(rule)


@router.post("/alerts/evaluate", dependencies=[Depends(analyst)])
def evaluate(as_of: date | None = None, db: Session = Depends(get_db)):
    if as_of and as_of > date.today():
        raise HTTPException(422, "Evaluation date cannot be in the future")
    result = evaluate_alerts(db, as_of)
    db.commit()
    return result


@router.get("/alerts")
def alerts(status: str | None = None, limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)):
    if status and status not in ("open", "acknowledged", "resolved"):
        raise HTTPException(422, "Unknown alert status")
    query = select(Alert).options(joinedload(Alert.location)).order_by(Alert.id.desc()).limit(limit)
    if status:
        query = query.where(Alert.status == status)
    return [
        {
            **{
                key: getattr(a, key)
                for key in (
                    "id",
                    "rule_id",
                    "rule_name",
                    "disease",
                    "location_id",
                    "severity",
                    "value",
                    "threshold",
                    "window_start",
                    "window_end",
                    "status",
                    "resolution",
                    "created_at",
                    "updated_at",
                )
            },
            "location_name": a.location.name,
        }
        for a in db.scalars(query)
    ]


@router.post("/alerts/{alert_id}/action")
def act(alert_id: int, data: AlertAction, user: User = Depends(analyst), db: Session = Depends(get_db)):
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(404, "Alert not found")
    if alert.status == "resolved":
        raise HTTPException(409, "This alert is already resolved")
    if data.action == "acknowledge":
        alert.status = "acknowledged"
        alert.acknowledged_by = user.id
    else:
        alert.status = "resolved"
        alert.resolution = f"Resolved by {user.username}."
    alert.updated_at = utcnow()
    db.commit()
    return {"id": alert.id, "status": alert.status}
