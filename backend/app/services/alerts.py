"""Alert incidents are distinct from idempotent daily evaluation evidence."""

from datetime import date, timedelta

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.models.models import Alert, AlertEvaluation, AlertRule, Case, Location
from app.services.geography import scope_expression
from app.services.observations import interval
from app.services.surveillance import utcnow


def evaluate_alerts(db, as_of: date | None = None):
    historical = as_of is not None and as_of != date.today()
    as_of = as_of or date.today()
    db.flush()
    ids = list(db.scalars(select(AlertRule.id).where(AlertRule.enabled.is_(True)).order_by(AlertRule.id)))
    created = 0
    for rule_id in ids:
        # Common lock serializes incident/evidence updates across workers and API requests.
        db.execute(update(AlertRule).where(AlertRule.id == rule_id).values(name=AlertRule.name))
        rule = db.get(AlertRule, rule_id, populate_existing=True)
        if not rule.enabled:
            continue
        start = as_of - timedelta(days=rule.window_days - 1)
        scope_ids = select(Location.id).where(
            scope_expression() == rule.geographic_scope, Location.archived_at.is_(None)
        )
        filters = [Case.location_id.in_(scope_ids), Case.date <= as_of]
        if rule.disease:
            filters.append(Case.disease == rule.disease)
        if rule.location_id:
            filters.append(Case.location_id == rule.location_id)
        # Include known series with no reports in today's window, so silence is explicit evidence.
        series = db.execute(select(Case.location_id, Case.disease).where(*filters).distinct()).all()
        active = list(
            db.scalars(
                select(Alert).where(
                    Alert.location_id.in_(select(Location.id).where(Location.archived_at.is_(None))),
                    Alert.rule_id == rule.id,
                    Alert.is_historical == historical,
                    Alert.status.in_(["open", "acknowledged"]),
                )
            )
        )
        identities = set(series) | {(a.location_id, a.disease) for a in active}
        for location_id, disease in sorted(identities):
            rows = list(
                db.scalars(
                    select(Case)
                    .where(
                        Case.location_id == location_id, Case.disease == disease, Case.date >= start, Case.date <= as_of
                    )
                    .order_by(Case.date)
                )
            )
            latest = db.scalar(
                select(Case.date)
                .where(Case.location_id == location_id, Case.disease == disease, Case.date <= as_of)
                .order_by(Case.date.desc())
                .limit(1)
            )
            periods = sorted({row.reporting_period_days for row in rows})
            covered = set()
            for row in rows:
                first, last = interval(row)
                covered.update(first + timedelta(days=i) for i in range((last - first).days + 1))
            complete = all(start + timedelta(days=i) in covered for i in range(rule.window_days))
            count = sum(row.case_count for row in rows) if rows else None
            if any(row.quality_status != "valid" for row in rows):
                state = "conflict"
            elif any(period > rule.window_days for period in periods):
                state = "incompatible_period"
            elif count is None:
                state = "missing"
            elif count >= rule.threshold:
                state = "above"
            elif complete:
                state = "below"
            else:
                state = "incomplete"
            incidents = list(
                db.scalars(
                    select(Alert)
                    .where(
                        Alert.rule_id == rule.id,
                        Alert.location_id == location_id,
                        Alert.disease == disease,
                        Alert.is_historical == historical,
                    )
                    .order_by(Alert.id.desc())
                )
            )
            # Historical evaluations are separate dated exercises, never current incidents.
            incident = next(
                (a for a in incidents if (a.window_end == as_of if historical else a.status != "resolved")), None
            )
            if not historical:
                for duplicate in [a for a in incidents if a.status != "resolved" and a is not incident]:
                    duplicate.status = "resolved"
                    duplicate.resolution = "Superseded by the continuing incident."
                latest_manual = next(
                    (a for a in incidents if a.resolution and a.resolution.startswith("Resolved by ")), None
                )
                suppressed = bool(
                    not incident
                    and latest_manual
                    and (not latest or latest <= (latest_manual.latest_report_date or latest_manual.window_end))
                )
            else:
                suppressed = False
            if state == "above" and not incident and not suppressed:
                incident = Alert(
                    rule_id=rule.id,
                    location_id=location_id,
                    disease=disease,
                    rule_name=rule.name,
                    severity=rule.severity,
                    value=count,
                    threshold=rule.threshold,
                    window_start=start,
                    window_end=as_of,
                    is_historical=historical,
                    data_state=state,
                    latest_report_date=latest,
                )
                db.add(incident)
                db.flush()
                created += 1
            if incident:
                if incident.status != "resolved":
                    incident.window_start = start
                    incident.window_end = as_of
                    incident.data_state = state
                    incident.latest_report_date = latest
                    incident.updated_at = utcnow()
                    if count is not None:
                        incident.value = count
                    if state == "below":
                        incident.status = "resolved"
                        incident.resolution = "Complete reporting window is below the threshold."
                # Historical exercises can be re-evaluated after a source correction.
                elif historical and state == "above" and incident.resolution != "Resolved by analyst.":
                    if incident.resolution and not incident.resolution.startswith("Resolved by "):
                        incident.status = "open"
                        incident.resolution = None
                        incident.value = count
                        incident.data_state = state
            insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
            values = dict(
                rule_id=rule.id,
                location_id=location_id,
                disease=disease,
                as_of=as_of,
                is_historical=historical,
                state=state,
                value=count,
                threshold=rule.threshold,
                window_start=start,
                latest_report_date=latest,
                complete=complete,
                periods=periods,
                incident_id=incident.id if incident else None,
            )
            db.execute(
                insert(AlertEvaluation)
                .values(**values)
                .on_conflict_do_update(
                    index_elements=["rule_id", "location_id", "disease", "as_of", "is_historical"],
                    set_={
                        key: value
                        for key, value in values.items()
                        if key not in ("rule_id", "location_id", "disease", "as_of", "is_historical")
                    },
                )
            )
    return {"created": created, "evaluated_rules": len(ids), "as_of": as_of, "historical": historical}


def retire_rule_alerts(db, rule_id, reason):
    for alert in db.scalars(select(Alert).where(Alert.rule_id == rule_id, Alert.status != "resolved")):
        alert.status = "resolved"
        alert.resolution = reason
        alert.updated_at = utcnow()
