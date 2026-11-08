from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.orm import Session, joinedload

from app.auth.security import analyst
from app.db.session import get_db
from app.models.models import Alert, AlertEvaluation, AlertRule, Location, Outbreak, User
from app.schemas.surveillance import AlertAction, AlertRuleInput
from app.services.alerts import evaluate_alerts, retire_rule_alerts
from app.services.surveillance import add_update, utcnow

router = APIRouter(tags=["alerts"], dependencies=[Depends(analyst)])


def rule_json(rule):
    return {
        key: getattr(rule, key)
        for key in (
            "id",
            "name",
            "disease",
            "location_id",
            "threshold",
            "window_days",
            "severity",
            "enabled",
            "geographic_scope",
        )
    }


@router.get("/alert-rules")
def rules(db: Session = Depends(get_db)):
    return [rule_json(rule) for rule in db.scalars(select(AlertRule).order_by(AlertRule.id.desc()))]


@router.post("/alert-rules", status_code=201)
def create_rule(data: AlertRuleInput, user: User = Depends(analyst), db: Session = Depends(get_db)):
    if data.location_id and not db.get(Location, data.location_id):
        raise HTTPException(422, "Location not found")
    validate_rule_area(db, data)
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
    db.execute(select(AlertRule).where(AlertRule.id == rule_id).with_for_update())
    validate_rule_area(db, data)
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
def alerts(
    status: str | None = None,
    historical: bool = False,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    if status and status not in ("open", "acknowledged", "resolved"):
        raise HTTPException(422, "Unknown alert status")
    query = (
        select(Alert)
        .where(Alert.is_historical == historical)
        .options(joinedload(Alert.location))
        .order_by(Alert.id.desc())
        .limit(limit)
    )
    if status:
        query = query.where(Alert.status == status)
    return [
        {
            **{
                key: getattr(a, key)
                for key in (
                    "id",
                    "outbreak_id",
                    "is_historical",
                    "data_state",
                    "latest_report_date",
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
            "observed_value": None
            if a.data_state in ("missing", "unknown", "conflict", "incompatible_period")
            else a.value,
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


def validate_rule_area(db, data):
    if data.location_id:
        location = db.get(Location, data.location_id)
        if location and location.geographic_scope != data.geographic_scope:
            raise HTTPException(422, "Rule geography must match its reporting area")


@router.get("/alerts/{alert_id}/evaluations")
def evidence(alert_id: int, db: Session = Depends(get_db)):
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(404, "Alert not found")
    return [
        {
            key: getattr(row, key)
            for key in (
                "as_of",
                "state",
                "value",
                "threshold",
                "window_start",
                "latest_report_date",
                "complete",
                "periods",
                "is_historical",
            )
        }
        for row in db.scalars(
            select(AlertEvaluation)
            .where(AlertEvaluation.incident_id == alert_id)
            .order_by(AlertEvaluation.as_of.desc())
            .limit(90)
        )
    ]


@router.post("/alerts/{alert_id}/investigation")
def followup(alert_id: int, user: User = Depends(analyst), db: Session = Depends(get_db)):
    db.execute(update(Alert).where(Alert.id == alert_id).values(value=Alert.value))
    alert = db.get(Alert, alert_id, populate_existing=True)
    if not alert:
        raise HTTPException(404, "Alert not found")
    if alert.outbreak_id:
        return {"outbreak_id": alert.outbreak_id}
    outbreak = Outbreak(
        title=f"Review · {alert.rule_name}"[:200],
        disease=alert.disease,
        status="investigating",
        priority=alert.severity,
        started_on=alert.window_start,
        owner_id=user.id,
        description=f"Follow-up for alert #{alert.id}. Review source coverage and reporting periods before linking observations. This signal does not confirm an outbreak.",
    )
    outbreak.locations = [db.get(Location, alert.location_id)]
    db.add(outbreak)
    db.flush()
    alert.outbreak_id = outbreak.id
    add_update(
        db, outbreak, user.id, f"Created from alert #{alert.id}. No observations were automatically linked.", "created"
    )
    db.commit()
    return {"outbreak_id": outbreak.id}
