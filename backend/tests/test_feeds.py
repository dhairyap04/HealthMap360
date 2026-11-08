from datetime import date, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app import worker
from app.models.models import Case, CaseRevision, Feed
from app.services import feeds


@pytest.fixture
def source(monkeypatch):
    rows = [
        {
            "Date_reported": (date.today() - timedelta(days=7)).isoformat(),
            "Country_code": "CA",
            "Country": "Canada",
            "New_cases": "12",
        },
        {"Date_reported": date.today().isoformat(), "Country_code": "CA", "Country": "Canada", "New_cases": "0"},
        {
            "Date_reported": date.today().isoformat(),
            "Country_code": "US",
            "Country": "United States of America",
            "New_cases": "30",
        },
    ]
    monkeypatch.setattr(feeds, "load_who_rows", lambda: rows)
    return rows


@pytest.fixture
def connection(client, auth, source):
    location = client.post(
        "/locations",
        headers=auth["analyst"],
        json={
            "name": "Canada",
            "latitude": 56,
            "longitude": -106,
            "administrative_level": "country",
            "country_code": "CA",
        },
    ).json()
    payload = {
        "name": "WHO Canada",
        "provider": "who_covid_weekly",
        "country_code": "CA",
        "location_id": location["id"],
        "start_date": (date.today() - timedelta(days=30)).isoformat(),
        "enabled": True,
    }
    created = client.post("/feeds", headers=auth["analyst"], json=payload)
    assert created.status_code == 201, created.text
    return created.json(), payload


def test_feed_sync_idempotence_revisions_and_weekly_export(client, auth, source, connection, database):
    feed, _ = connection
    first = client.post(f"/feeds/{feed['id']}/sync", headers=auth["analyst"])
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "success", first.text
    assert first.json()["imported"] == 2
    assert client.post(f"/feeds/{feed['id']}/sync", headers=auth["analyst"]).json()["skipped"] == 2
    source[0]["New_cases"] = "20"
    revised = client.post(f"/feeds/{feed['id']}/sync", headers=auth["analyst"]).json()
    assert revised["updated"] == 1
    data = client.get("/cases", headers=auth["analyst"]).json()["items"]
    assert all(row["reporting_period_days"] == 7 and row["feed_id"] == feed["id"] for row in data)
    assert client.get("/summary?geographic_scope=national", headers=auth["analyst"]).json()["total_cases"] == 20
    exported = client.get("/cases/export", headers=auth["analyst"]).text
    assert "reporting_period_days" in exported
    assert len(client.get(f"/feeds/{feed['id']}/runs", headers=auth["analyst"]).json()) == 3
    with Session(database) as db:
        revisions = db.scalars(select(CaseRevision).where(CaseRevision.action == "feed_revision")).all()
        assert len(revisions) == 1
        assert revisions[0].before["case_count"] == 12
        assert revisions[0].after["case_count"] == 20


def test_feed_cannot_write_city_or_wrong_country(client, auth, source):
    city = client.post(
        "/locations",
        headers=auth["analyst"],
        json={
            "name": "Edmonton",
            "latitude": 53,
            "longitude": -113,
            "administrative_level": "city",
            "country_code": "CA",
        },
    ).json()
    payload = {
        "name": "Invalid scope",
        "country_code": "CA",
        "location_id": city["id"],
        "start_date": date.today().isoformat(),
    }
    assert client.post("/feeds", headers=auth["analyst"], json=payload).status_code == 422
    country = client.post(
        "/locations",
        headers=auth["analyst"],
        json={
            "name": "United States",
            "latitude": 40,
            "longitude": -100,
            "administrative_level": "country",
            "country_code": "US",
        },
    ).json()
    assert (
        client.post("/feeds", headers=auth["analyst"], json={**payload, "location_id": country["id"]}).status_code
        == 422
    )
    assert client.post("/feeds", headers=auth["reader"], json=payload).status_code == 403


def test_negative_adjustments_fail_atomically_and_are_logged(client, auth, source, connection, database):
    feed, _ = connection
    source[1]["New_cases"] = "-3"
    result = client.post(f"/feeds/{feed['id']}/sync", headers=auth["analyst"]).json()
    assert result["status"] == "failed"
    assert "negative" in result["message"]
    with Session(database) as db:
        assert db.scalar(select(func.count(Case.id))) == 0
        assert db.scalar(select(func.count(CaseRevision.id))) == 0
    assert client.get("/feeds", headers=auth["analyst"]).json()[0]["last_error"]


def test_manual_corrections_are_not_overwritten(client, auth, source, connection):
    feed, _ = connection
    assert client.post(f"/feeds/{feed['id']}/sync", headers=auth["analyst"]).json()["status"] == "success"
    observation = client.get("/cases", headers=auth["analyst"]).json()["items"][0]
    corrected = client.put(
        f"/cases/{observation['id']}", headers=auth["analyst"], json={**observation, "case_count": 9}
    )
    assert corrected.status_code == 200 and corrected.json()["feed_id"] is None
    result = client.post(f"/feeds/{feed['id']}/sync", headers=auth["analyst"]).json()
    assert result["status"] == "failed" and "analyst-owned" in result["message"]
    assert client.get("/summary?geographic_scope=national", headers=auth["analyst"]).json()["total_cases"] == 21


def test_pause_works_during_source_outage(client, auth, source, connection, monkeypatch):
    feed, payload = connection
    monkeypatch.setattr(feeds, "load_who_rows", lambda: (_ for _ in ()).throw(RuntimeError("offline")))
    paused = client.put(f"/feeds/{feed['id']}", headers=auth["analyst"], json={**payload, "enabled": False})
    assert paused.status_code == 200 and not paused.json()["enabled"]
    assert client.post(f"/feeds/{feed['id']}/sync", headers=auth["analyst"]).status_code == 409


def test_missing_counts_are_not_imported_as_zero(client, auth, source, connection):
    feed, _ = connection
    source[0]["New_cases"] = ""
    result = client.post(f"/feeds/{feed['id']}/sync", headers=auth["analyst"]).json()
    assert result["imported"] == 1
    rows = client.get("/cases", headers=auth["analyst"]).json()["items"]
    assert len(rows) == 1 and rows[0]["case_count"] == 0


def test_worker_processes_due_feeds_and_reports_heartbeat(client, auth, source, connection, database, monkeypatch):
    feed, _ = connection
    monkeypatch.setattr(worker, "SessionLocal", sessionmaker(database, expire_on_commit=False))
    assert not client.get("/feeds/worker-status", headers=auth["analyst"]).json()["online"]
    worker.run_once()
    assert client.get("/feeds/worker-status", headers=auth["analyst"]).json()["online"]
    history = client.get(f"/feeds/{feed['id']}/runs", headers=auth["analyst"]).json()
    assert len(history) == 1 and history[0]["status"] == "success"
    worker.run_once()
    assert len(client.get(f"/feeds/{feed['id']}/runs", headers=auth["analyst"]).json()) == 1
    with Session(database) as db:
        assert db.get(Feed, feed["id"]).lease_until is None


def test_preview_is_read_only_and_imports_never_take_feed_priority(client, auth, source, connection, database):
    feed, payload = connection
    preview = client.post("/feeds/preview", headers=auth["analyst"], json={**payload, "severity": "critical"})
    assert preview.status_code == 200, preview.text
    data = preview.json()
    assert data["records"] == 2 and data["reported_cases"] == 12
    assert data["assessment"] == "unassessed" and data["reporting_period_days"] == 7
    with Session(database) as db:
        assert db.scalar(select(func.count(Case.id))) == 0
    assert client.post("/feeds/preview", headers=auth["reader"], json=payload).status_code == 403
    assert client.post(f"/feeds/{feed['id']}/sync", headers=auth["analyst"]).json()["imported"] == 2
    rows = client.get("/cases", headers=auth["analyst"]).json()["items"]
    assert all(row["severity"] == "unassessed" for row in rows)
    # A deliberate assessment is retained when WHO revises its factual count.
    row = next(row for row in rows if row["case_count"] == 12)
    review = client.put(f"/cases/{row['id']}", headers=auth["analyst"], json={**row, "severity": "high"})
    assert review.status_code == 200 and review.json()["feed_id"] == feed["id"]
    source[0]["New_cases"] = "25"
    assert client.post(f"/feeds/{feed['id']}/sync", headers=auth["analyst"]).json()["updated"] == 1
    revised = next(r for r in client.get("/cases", headers=auth["analyst"]).json()["items"] if r["id"] == row["id"])
    assert revised["severity"] == "high" and revised["case_count"] == 25


def test_preview_checks_source_adjustments_missing_and_historical_data(client, auth, source, connection):
    _, payload = connection
    source[0]["New_cases"] = "-5"
    assert client.post("/feeds/preview", headers=auth["analyst"], json=payload).status_code == 422
    source[0]["New_cases"] = ""
    preview = client.post("/feeds/preview", headers=auth["analyst"], json=payload).json()
    assert preview["records"] == 1 and preview["reported_cases"] == 0
    source[0].update(Date_reported="2021-12-26", New_cases="123")
    source[1]["New_cases"] = ""
    preview = client.post(
        "/feeds/preview", headers=auth["analyst"], json={**payload, "start_date": "2021-01-01"}
    ).json()
    assert preview["historical"] is True and preview["latest_source_report"] == "2021-12-26"
    assert preview["reported_cases"] == 123


def test_feed_country_identity_cannot_be_changed_through_location_editor(client, auth, source, connection):
    feed, _ = connection
    location = next(
        place
        for place in client.get("/locations", headers=auth["analyst"]).json()
        if place["id"] == feed["location_id"]
    )
    for change in [{"administrative_level": "city"}, {"country_code": "US"}]:
        assert (
            client.put(f"/locations/{location['id']}", headers=auth["analyst"], json={**location, **change}).status_code
            == 422
        )
    assert (
        client.put(
            f"/locations/{location['id']}",
            headers=auth["analyst"],
            json={**location, "name": "Canada national reports"},
        ).status_code
        == 200
    )
