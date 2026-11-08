from datetime import date, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import Alert, AlertEvaluation, AlertRule, Case, Publication
from app.services import alerts as signals


def place(client, auth, name="Review area", level="city"):
    return client.post(
        "/locations",
        headers=auth["analyst"],
        json={"name": name, "latitude": 53, "longitude": -113, "administrative_level": level},
    ).json()


def observation(client, auth, location, day=None, count=100, period=1, source="Official aggregate fixture"):
    return client.post(
        "/cases",
        headers=auth["analyst"],
        json={
            "location_id": location["id"],
            "disease": "influenza",
            "date": str(day or date.today()),
            "case_count": count,
            "reporting_period_days": period,
            "source": source,
        },
    )


def draft_payload(location):
    return {
        "location_id": location["id"],
        "disease": "influenza",
        "date_from": str(date.today() - timedelta(days=30)),
        "date_to": str(date.today()),
        "title": "Reviewed public report",
        "public_name": "Public reporting area",
        "summary": "Approved aggregate information, without private investigation notes.",
        "methodology": "Reporting-date counts. Missing reports do not mean zero. Coverage may vary.",
        "source_name": "Official source fixture",
        "source_url": "https://example.com/methodology",
    }


@pytest.mark.parametrize(
    "path",
    [
        "/cases",
        "/cases/export",
        "/cases/1/history",
        "/locations",
        "/diseases",
        "/summary",
        "/monitoring",
        "/resources",
        "/feeds",
        "/feeds/1/runs",
        "/feeds/worker-status",
        "/outbreaks",
        "/outbreaks/owners",
        "/outbreaks/1",
        "/outbreaks/1/observations",
        "/alert-rules",
        "/alerts",
        "/alerts/1/evaluations",
        "/publications",
        "/publications/1/history",
        "/data-health",
    ],
)
def test_public_cannot_read_any_analyst_endpoint(client, auth, path):
    assert client.get(path).status_code == 401
    assert client.get(path, headers=auth["reader"]).status_code == 403


def test_publication_requires_review_and_never_exposes_private_data(client, auth):
    area = place(client, auth)
    record = observation(client, auth, area).json()
    data = draft_payload(area)
    assert client.get("/public/reports").json()["items"] == []
    draft = client.post("/publications", headers=auth["analyst"], json=data)
    assert draft.status_code == 201, draft.text
    publication = draft.json()["id"]
    url = f"/publications/{publication}/publish"
    assert client.get(f"/public/reports/{publication}").status_code == 404
    assert client.post(url, headers=auth["reader"], json={"reviewed": True}).status_code == 403
    assert client.post(url, headers=auth["analyst"], json={"reviewed": True}).status_code == 403
    assert client.post(url, headers=auth["admin"], json={"reviewed": False}).status_code == 422
    assert client.post(url, headers=auth["admin"], json={"reviewed": True}).status_code == 200
    public = client.get(f"/public/reports/{publication}").json()
    assert public["total_cases"] == 100
    text = str(public)
    for forbidden in (
        "latitude",
        "longitude",
        "created_by",
        "owner_id",
        "severity",
        "feed_id",
        "Official aggregate fixture",
        "version",
        "fingerprint",
    ):
        assert forbidden not in text
    assert (
        client.put(f"/cases/{record['id']}", headers=auth["analyst"], json={**record, "case_count": 200}).status_code
        == 200
    )
    assert client.get(f"/public/reports/{publication}").json()["total_cases"] == 100
    assert client.post(f"/publications/{publication}/withdraw", headers=auth["admin"]).status_code == 200
    assert client.get(f"/public/reports/{publication}").status_code == 404
    assert client.get("/public/reports").json()["items"] == []


def test_publication_rejects_demo_changed_drafts_and_withholds_reconstructable_totals(client, auth):
    area = place(client, auth)
    row = observation(client, auth, area, count=2).json()
    data = draft_payload(area)
    draft = client.post("/publications", headers=auth["analyst"], json=data).json()
    assert draft["payload"]["total_cases"] is None and draft["payload"]["reports"][0]["cases"] is None
    assert client.put(f"/cases/{row['id']}", headers=auth["analyst"], json={**row, "case_count": 3}).status_code == 200
    assert (
        client.post(f"/publications/{draft['id']}/publish", headers=auth["admin"], json={"reviewed": True}).status_code
        == 409
    )
    other = place(client, auth, "Demo area")
    observation(client, auth, other, source="Demonstration data")
    assert client.post("/publications", headers=auth["analyst"], json=draft_payload(other)).status_code == 409


def test_all_manual_and_csv_writers_reject_overlaps_transactionally(client, auth):
    area = place(client, auth)
    day = date.today()
    weekly = observation(client, auth, area, period=7)
    assert weekly.status_code == 201
    assert observation(client, auth, area, day - timedelta(days=1), count=20).status_code == 409
    assert observation(client, auth, area, day - timedelta(days=7), count=20).status_code == 201
    csv = f"date,location,disease,case_count,reporting_period_days\n{day - timedelta(days=2)},Review area,influenza,20,1\n{day},New unrelated,influenza,1,1\n"
    # First conflict is enough; an unrelated new area cannot be partially saved.
    r = client.post("/imports", headers=auth["analyst"], files={"file": ("overlap.csv", csv, "text/csv")})
    assert r.status_code in (409, 422)
    assert client.get("/cases", headers=auth["analyst"]).json()["total"] == 2
    adjacent = client.get("/cases", headers=auth["analyst"]).json()["items"][-1]
    assert (
        client.put(
            f"/cases/{adjacent['id']}", headers=auth["analyst"], json={**adjacent, "date": str(day - timedelta(days=3))}
        ).status_code
        == 409
    )
    assert client.get("/cases", headers=auth["analyst"]).json()["total"] == 2


def test_investigation_totals_are_separate_and_geography_cannot_move_under_reports(client, auth):
    city = place(client, auth)
    country = place(client, auth, "Country fixture", "country")
    rows = [observation(client, auth, area).json()["id"] for area in (city, country)]
    case = client.post(
        "/outbreaks",
        headers=auth["analyst"],
        json={
            "title": "Mixed investigation",
            "disease": "influenza",
            "started_on": str(date.today()),
            "location_ids": [city["id"], country["id"]],
        },
    ).json()
    assert (
        client.post(
            f"/outbreaks/{case['id']}/observations",
            headers=auth["analyst"],
            json={"action": "attach", "observation_ids": rows},
        ).status_code
        == 200
    )
    detail = client.get(f"/outbreaks/{case['id']}", headers=auth["analyst"]).json()
    assert detail["reported_cases"] is None and len(detail["totals_by_location"]) == 2 and detail["trend"] == []
    assert (
        client.put(
            f"/locations/{city['id']}", headers=auth["analyst"], json={**city, "administrative_level": "country"}
        ).status_code
        == 409
    )


def test_alert_incident_spans_days_without_resolving_missing_data(client, auth, database, monkeypatch):
    area = place(client, auth)
    first = date(2026, 10, 1)
    current = [first]

    class Clock(date):
        @classmethod
        def today(cls):
            return current[0]

    monkeypatch.setattr(signals, "date", Clock)
    with Session(database) as db:
        db.add(
            Case(
                location_id=area["id"],
                date=first,
                disease="influenza",
                case_count=100,
                severity="unassessed",
                reporting_period_days=7,
            )
        )
        db.add(
            AlertRule(
                name="Continuing signal",
                location_id=area["id"],
                disease="influenza",
                threshold=50,
                window_days=7,
                user_id=1,
            )
        )
        signals.evaluate_alerts(db)
        db.commit()
        current[0] = first + timedelta(days=1)
        signals.evaluate_alerts(db)
        db.commit()
        alerts = list(db.scalars(select(Alert)))
        assert len(alerts) == 1 and alerts[0].status == "open"
        assert len(list(db.scalars(select(AlertEvaluation)))) == 2
        current[0] = first + timedelta(days=8)
        signals.evaluate_alerts(db)
        db.commit()
        db.refresh(alerts[0])
        assert alerts[0].status == "open" and alerts[0].data_state == "missing"
        for offset in range(2, 9):
            db.add(
                Case(
                    location_id=area["id"],
                    date=first + timedelta(days=offset),
                    disease="influenza",
                    case_count=0,
                    severity="unassessed",
                    reporting_period_days=1,
                )
            )
        signals.evaluate_alerts(db)
        db.commit()
        db.refresh(alerts[0])
        assert alerts[0].status == "resolved"
        signals.evaluate_alerts(db, first)
        db.commit()
        assert db.scalar(select(Alert).where(Alert.is_historical.is_(True))) is not None
        assert len(list(db.scalars(select(Alert).where(Alert.is_historical.is_(False))))) == 1


def test_auth_attempts_are_bounded_and_recovery_is_single_use(client, auth, database, monkeypatch):
    from app.core.config import get_settings
    from app.models.models import User
    from app.services.account_security import issue_recovery

    monkeypatch.setattr(get_settings(), "auth_attempt_limit", 2)
    for _ in range(2):
        assert client.post("/auth/login", json={"username": "unknown_user", "password": "wrong"}).status_code == 401
    assert client.post("/auth/login", json={"username": "unknown_user", "password": "wrong"}).status_code == 429
    with Session(database) as db:
        token = issue_recovery(db, db.scalar(select(User).where(User.username == "analyst")))
    payload = {"token": token, "new_password": "recovered-password-123"}
    assert client.post("/auth/recover", json=payload).status_code == 204
    assert client.post("/auth/recover", json=payload).status_code == 400
    assert client.get("/auth/me", headers=auth["analyst"]).status_code == 401
    assert (
        client.post("/auth/login", json={"username": "analyst", "password": "recovered-password-123"}).status_code
        == 200
    )


def test_mfa_enrollment_encryption_login_and_replay_protection(client, auth, database, monkeypatch):
    import time

    from app.models.models import User
    from app.services import account_security

    clock = [int(time.time())]
    monkeypatch.setattr(account_security.time, "time", lambda: clock[0])
    request = {"password": "test-password-123"}
    enrolled = client.post("/auth/mfa/enroll", headers=auth["admin"], json=request)
    assert enrolled.status_code == 200, enrolled.text
    secret = enrolled.json()["secret"]
    code = account_security.totp(secret, clock[0] // 30)
    assert client.post("/auth/mfa/confirm", headers=auth["admin"], json={**request, "code": code}).status_code == 204
    assert client.get("/auth/me", headers=auth["admin"]).status_code == 401
    login = {"username": "admin", "password": "test-password-123"}
    assert client.post("/auth/login", json=login).status_code == 401
    assert client.post("/auth/login", json={**login, "otp": code}).status_code == 401
    clock[0] += 30
    code = account_security.totp(secret, clock[0] // 30)
    assert client.post("/auth/login", json={**login, "otp": code}).status_code == 200
    assert client.post("/auth/login", json={**login, "otp": code}).status_code == 401
    with Session(database) as db:
        assert db.scalar(select(User.mfa_secret).where(User.username == "admin")) != secret


def test_production_mfa_gate_does_not_block_enrollment(client, auth, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "require_admin_mfa", True)
    assert client.get("/cases", headers=auth["admin"]).status_code == 403
    assert client.get("/auth/me", headers=auth["admin"]).json()["mfa_required"] is True
    assert (
        client.post("/auth/mfa/enroll", headers=auth["admin"], json={"password": "test-password-123"}).status_code
        == 200
    )


def test_concurrent_overlapping_writers_cannot_both_commit(client, auth):
    from concurrent.futures import ThreadPoolExecutor

    area = place(client, auth)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(observation, client, auth, area, date.today() - timedelta(days=offset), 100, period)
            for offset, period in [(0, 7), (1, 1)]
        ]
        statuses = sorted(future.result().status_code for future in futures)
    assert statuses == [201, 409]
    assert client.get("/cases", headers=auth["analyst"]).json()["total"] == 1


def test_alert_followup_is_idempotent_and_links_no_cases_automatically(client, auth):
    area = place(client, auth)
    observation(client, auth, area)
    client.post(
        "/alert-rules",
        headers=auth["analyst"],
        json={"name": "Follow up", "disease": "influenza", "threshold": 10, "window_days": 7},
    )
    alert = client.get("/alerts", headers=auth["analyst"]).json()[0]
    url = f"/alerts/{alert['id']}/investigation"
    first = client.post(url, headers=auth["analyst"])
    assert first.status_code == 200, first.text
    assert client.post(url, headers=auth["analyst"]).json() == first.json()
    detail = client.get(f"/outbreaks/{first.json()['outbreak_id']}", headers=auth["analyst"]).json()
    assert detail["status"] == "investigating" and detail["observations"] == 0
    assert client.post(url, headers=auth["reader"]).status_code == 403


def test_backup_restore_refuses_nonempty_and_checks_integrity(database, tmp_path):
    from sqlalchemy import create_engine, func
    from sqlalchemy.engine import make_url

    from app.operations import backup, restore

    if database.dialect.name != "sqlite":
        pytest.skip("PostgreSQL restore exercised with actual pg_dump/pg_restore in the operational drill")
    saved = tmp_path / "backup.db"
    backup(database.url, saved)
    target = make_url("sqlite:///" + str(tmp_path / "restored.db"))
    restore(target, saved)
    restored = create_engine(target)
    with Session(database) as source, Session(restored) as copy:
        assert copy.scalar(select(func.count(Case.id))) == source.scalar(select(func.count(Case.id)))
    restored.dispose()
    with pytest.raises(RuntimeError, match="empty"):
        restore(target, saved)
    saved.write_bytes(saved.read_bytes() + b"corrupted")
    with pytest.raises(RuntimeError, match="checksum"):
        restore(make_url("sqlite:///" + str(tmp_path / "other.db")), saved)


def test_migration_preserves_and_flags_legacy_overlaps_without_publishing(database):
    from pathlib import Path

    from alembic import command
    from alembic.config import Config
    from sqlalchemy import func, text

    from app.models.models import CaseRevision

    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.downgrade(config, "0005")
    with database.begin() as db:
        db.execute(
            text(
                "INSERT INTO locations (id,name,name_key,latitude,longitude) VALUES (1,'Legacy area','legacy area',53,-113)"
            )
        )
        db.execute(
            text(
                "INSERT INTO cases (id,location_id,date,disease,case_count,severity,reporting_period_days) VALUES (1,1,'2026-11-07','influenza',100,'low',7),(2,1,'2026-11-06','influenza',20,'high',1)"
            )
        )
        db.execute(text("INSERT INTO case_revisions (case_id,action) VALUES (1,'legacy_audit')"))
    command.upgrade(config, "head")
    with Session(database) as db:
        assert db.scalar(select(func.count(Case.id))) == 2
        assert db.scalar(select(func.sum(Case.case_count))) == 120
        assert db.scalar(select(func.count(Case.id)).where(Case.quality_status == "review")) == 2
        assert db.scalar(select(func.count(CaseRevision.id))) == 1
        assert db.scalar(select(func.count(Publication.id))) == 0


def test_large_series_remains_paginated_and_summary_queries_are_bounded(client, auth, database):
    from sqlalchemy import event

    area = place(client, auth)
    with Session(database) as db:
        db.add_all(
            [
                Case(
                    location_id=area["id"],
                    date=date.today() - timedelta(days=offset),
                    disease="influenza",
                    case_count=100,
                    severity="unassessed",
                )
                for offset in range(5000)
            ]
        )
        db.commit()
    queries = []

    def record_query(_conn, _cursor, statement, _parameters, _context, _many):
        queries.append(statement)

    event.listen(database, "before_cursor_execute", record_query)
    try:
        response = client.get("/summary", headers=auth["analyst"])
        assert response.status_code == 200, response.text
        assert response.json()["total_cases"] == 2800
        assert len(response.json()["trend"]) == 28
        assert len(queries) < 20
    finally:
        event.remove(database, "before_cursor_execute", record_query)
    page = client.get("/cases?page_size=50", headers=auth["analyst"]).json()
    assert page["total"] == 5000 and len(page["items"]) == 50


def test_workspace_day_and_publication_source_urls(client, auth):
    assert client.get("/public/config").json()["today"] == str(date.today())
    area = place(client, auth)
    observation(client, auth, area)
    for url in ("https://user:password@example.com/source", "http://example.com/source", "javascript:alert(1)"):
        response = client.post(
            "/publications", headers=auth["analyst"], json={**draft_payload(area), "source_url": url}
        )
        assert response.status_code == 422


def test_missing_alert_window_does_not_present_last_breach_as_current_count(client, auth):
    area = place(client, auth)
    record = observation(client, auth, area).json()
    client.post(
        "/alert-rules",
        headers=auth["analyst"],
        json={"name": "Missing report signal", "threshold": 10, "window_days": 7},
    )
    assert client.get("/alerts", headers=auth["analyst"]).json()[0]["observed_value"] == 100
    assert client.delete(f"/cases/{record['id']}", headers=auth["analyst"]).status_code == 204
    alert = client.get("/alerts", headers=auth["analyst"]).json()[0]
    assert alert["status"] == "open" and alert["data_state"] == "missing"
    assert alert["observed_value"] is None
