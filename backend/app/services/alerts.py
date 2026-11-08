from datetime import date, timedelta

from sqlalchemy import func, select

from app.models.models import Alert, AlertRule, Case
from app.services.surveillance import utcnow


def evaluate_alerts(db, as_of: date | None = None):
    """Evaluate reporting-date totals per disease/location. Never sends external messages."""
    as_of = as_of or date.today()
    db.flush()
    rules = db.scalars(select(AlertRule).where(AlertRule.enabled.is_(True))).all()
    created = 0
    for rule in rules:
        start = as_of - timedelta(days=rule.window_days - 1)
        filters = [Case.date >= start, Case.date <= as_of]
        if rule.disease:
            filters.append(Case.disease == rule.disease)
        if rule.location_id:
            filters.append(Case.location_id == rule.location_id)
        totals = db.execute(
            select(Case.location_id, Case.disease, func.sum(Case.case_count))
            .where(*filters)
            .group_by(Case.location_id, Case.disease)
        ).all()
        matching = {(location_id, disease): count for location_id, disease, count in totals if count >= rule.threshold}
        existing = {
            (a.location_id, a.disease): a
            for a in db.scalars(select(Alert).where(Alert.rule_id == rule.id, Alert.window_end == as_of))
        }
        for (location_id, disease), count in matching.items():
            alert = existing.get((location_id, disease))
            if alert is None:
                db.add(
                    Alert(
                        rule_id=rule.id,
                        location_id=location_id,
                        disease=disease,
                        rule_name=rule.name,
                        severity=rule.severity,
                        value=count,
                        threshold=rule.threshold,
                        window_start=start,
                        window_end=as_of,
                        status="open",
                    )
                )
                created += 1
            elif alert.status != "resolved" or alert.resolution == "Rule changed or paused.":
                if alert.resolution == "Rule changed or paused.":
                    alert.status = "open"
                    alert.resolution = None
                    alert.rule_name = rule.name
                    alert.threshold = rule.threshold
                    alert.severity = rule.severity
                    alert.window_start = start
                alert.value = count
                alert.updated_at = utcnow()
        for identity, alert in existing.items():
            if identity not in matching and alert.status != "resolved":
                alert.status = "resolved"
                alert.resolution = "Reported count is below the threshold after data changes."
                alert.updated_at = utcnow()
    return {"created": created, "evaluated_rules": len(rules), "as_of": as_of}


def retire_rule_alerts(db, rule_id, reason):
    for alert in db.scalars(select(Alert).where(Alert.rule_id == rule_id, Alert.status != "resolved")):
        alert.status = "resolved"
        alert.resolution = reason
        alert.updated_at = utcnow()
