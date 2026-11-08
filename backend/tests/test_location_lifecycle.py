from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import (
    Alert,
    AlertEvaluation,
    AlertRule,
    Case,
    CaseRevision,
    Feed,
    Location,
    LocationEvent,
    Outbreak,
    Publication,
    Resource,
)
from app.services import feeds
from app.services.surveillance import utcnow


def area(client, auth, **extra):
    response = client.post(
        "/locations",
        headers=auth["analyst"],
        json={"name": "Lifecycle area", "latitude": 53, "longitude": -113, **extra},
    )
    assert response.status_code == 201, response.text
    return response.json()


def report(client, auth, location, **extra):
    return client.post(
        "/cases",
        headers=auth["analyst"],
        json={
            "location_id": location["id"],
            "date": str(date.today()),
            "disease": "influenza",
            "case_count": 100,
            **extra,
        },
    )


def test_delete_unused_location_retains_tombstone_and_never_reuses_id(client, auth, database):
    location = area(client, auth)
    url = f"/locations/{location['id']}"
    assert client.get(url + "/usage", headers=auth["analyst"]).json()["can_delete"] is True
    assert client.delete(url, headers=auth["reader"]).status_code == 403
    assert client.delete(url).status_code == 401
    assert client.delete(url, headers=auth["analyst"]).status_code == 204
    assert client.delete(url, headers=auth["analyst"]).status_code == 404
    events = client.get(url + "/history", headers=auth["analyst"]).json()
    assert len(events) == 1 and events[0]["action"] == "delete" and events[0]["snapshot"]["name"] == location["name"]
    next_area = area(client, auth, name="Next area")
    assert next_area["id"] > location["id"]
    with Session(database) as db:
        assert db.get(Location, location["id"]) is None
        assert db.scalar(select(LocationEvent).where(LocationEvent.location_id == location["id"])) is not None


@pytest.mark.parametrize(
    "reference",
    [
        "observation",
        "resource",
        "feed",
        "rule",
        "alert",
        "evaluation",
        "investigation",
        "publication",
        "deleted_observation_history",
    ],
)
def test_delete_rejects_every_linked_reference_even_when_no_current_cases(client, auth, database, reference):
    location = area(client, auth)
    location_id = location["id"]
    with Session(database) as db:
        if reference == "observation":
            record = Case(
                location_id=location_id, date=date.today(), disease="influenza", case_count=10, severity="unassessed"
            )
        elif reference == "resource":
            record = Resource(location_id=location_id, type="masks", quantity=10)
        elif reference == "feed":
            record = Feed(
                location_id=location_id,
                name="Paused feed",
                provider="who_covid_weekly",
                country_code="CA",
                start_date=date.today(),
                created_by=1,
                enabled=False,
            )
        elif reference == "rule":
            record = AlertRule(location_id=location_id, name="Paused rule", threshold=5, user_id=1, enabled=False)
        elif reference in ("alert", "evaluation"):
            rule = AlertRule(name="Global rule", threshold=5, user_id=1)
            db.add(rule)
            db.flush()
            if reference == "alert":
                record = Alert(
                    rule_id=rule.id,
                    location_id=location_id,
                    disease="influenza",
                    rule_name="Global rule",
                    severity="medium",
                    value=10,
                    threshold=5,
                    window_start=date.today(),
                    window_end=date.today(),
                    status="resolved",
                )
            else:
                record = AlertEvaluation(
                    rule_id=rule.id,
                    location_id=location_id,
                    disease="influenza",
                    as_of=date.today(),
                    is_historical=True,
                    state="missing",
                    threshold=5,
                    window_start=date.today(),
                    complete=False,
                    periods=[],
                )
        elif reference == "investigation":
            record = Outbreak(
                title="Closed investigation",
                disease="influenza",
                started_on=date.today(),
                ended_on=date.today(),
                status="closed",
                owner_id=1,
            )
            record.locations = [db.get(Location, location_id)]
        elif reference == "publication":
            record = Publication(
                location_id=location_id,
                disease="influenza",
                date_from=date.today(),
                date_to=date.today(),
                title="Withdrawn snapshot",
                public_name="Area",
                summary="Historical summary",
                methodology="Reviewed reporting",
                source_name="Official",
                source_url="https://example.com",
                payload={},
                fingerprint="fixture",
                status="withdrawn",
                created_by=1,
            )
        else:
            record = CaseRevision(action="delete", user_id=1, before={"location_id": location_id}, after=None)
        db.add(record)
        db.commit()
    url = f"/locations/{location_id}"
    assert client.get(url + "/usage", headers=auth["analyst"]).json()["can_delete"] is False
    response = client.delete(url, headers=auth["analyst"])
    assert response.status_code == 409 and "Archive" in response.json()["detail"]
    assert client.get("/locations", headers=auth["analyst"]).json()[0]["id"] == location_id


def test_archive_hides_active_views_preserves_history_and_restore_is_idempotent(client, auth):
    location = area(client, auth)
    observation = report(client, auth, location).json()
    url = f"/locations/{location['id']}"
    assert client.post(url + "/archive", headers=auth["reader"]).status_code == 403
    assert client.post(url + "/restore", headers=auth["reader"]).status_code == 403
    assert client.post(url + "/archive", headers=auth["analyst"]).json()["archived_at"]
    assert client.post(url + "/archive", headers=auth["analyst"]).status_code == 200
    assert client.get("/locations", headers=auth["analyst"]).json() == []
    assert len(client.get("/locations?include_archived=true", headers=auth["analyst"]).json()) == 1
    assert client.get("/summary", headers=auth["analyst"]).json()["total_cases"] == 0
    history = client.get("/cases", headers=auth["analyst"]).json()["items"]
    assert history[0]["id"] == observation["id"] and history[0]["location"]["archived_at"]
    assert report(client, auth, location, disease="measles").status_code == 409
    assert (
        client.post(
            "/resources", headers=auth["analyst"], json={"type": "masks", "quantity": 10, "location_id": location["id"]}
        ).status_code
        == 409
    )
    csv = f"date,location,disease,case_count\n{date.today()},{location['name']},measles,10\n"
    assert (
        client.post("/imports", headers=auth["analyst"], files={"file": ("archived.csv", csv, "text/csv")}).status_code
        == 409
    )
    assert (
        client.post(
            "/outbreaks",
            headers=auth["analyst"],
            json={
                "title": "New investigation",
                "disease": "influenza",
                "started_on": str(date.today()),
                "location_ids": [location["id"]],
            },
        ).status_code
        == 409
    )
    assert client.post(url + "/restore", headers=auth["analyst"]).json()["archived_at"] is None
    assert client.post(url + "/restore", headers=auth["analyst"]).status_code == 200
    assert client.get("/summary", headers=auth["analyst"]).json()["total_cases"] == 100
    events = client.get(url + "/history", headers=auth["analyst"]).json()
    assert [row["action"] for row in events] == ["restore", "archive"]


def test_archive_pauses_monitoring_does_not_resume_it_and_rejects_running_sync(client, auth, database, monkeypatch):
    monkeypatch.setattr(
        feeds,
        "load_who_rows",
        lambda: [{"Country": "Canada", "Country_code": "CA", "Date_reported": str(date.today()), "New_cases": "100"}],
    )
    location = area(client, auth, name="Canada", administrative_level="country", country_code="CA")
    payload = {
        "name": "WHO Canada",
        "location_id": location["id"],
        "country_code": "CA",
        "start_date": str(date.today()),
        "enabled": True,
    }
    feed = client.post("/feeds", headers=auth["analyst"], json=payload).json()
    rule = client.post(
        "/alert-rules",
        headers=auth["analyst"],
        json={"name": "National rule", "location_id": location["id"], "geographic_scope": "national", "threshold": 10},
    ).json()
    url = f"/locations/{location['id']}"
    with Session(database) as db:
        db.get(Feed, feed["id"]).lease_until = utcnow() + timedelta(minutes=5)
        db.commit()
    assert client.post(url + "/archive", headers=auth["analyst"]).status_code == 409
    with Session(database) as db:
        db.get(Feed, feed["id"]).lease_until = None
        db.commit()
    assert client.post(url + "/archive", headers=auth["analyst"]).status_code == 200
    saved = client.get("/feeds", headers=auth["analyst"]).json()[0]
    assert saved["enabled"] is False and saved["location_archived"] is True
    assert client.get("/alert-rules", headers=auth["analyst"]).json()[0]["enabled"] is False
    assert client.post(f"/feeds/{feed['id']}/sync", headers=auth["analyst"]).status_code == 409
    assert client.put(f"/feeds/{feed['id']}", headers=auth["analyst"], json=payload).status_code == 409
    assert client.post(url + "/restore", headers=auth["analyst"]).status_code == 200
    assert client.get("/feeds", headers=auth["analyst"]).json()[0]["enabled"] is False
    assert client.get("/alert-rules", headers=auth["analyst"]).json()[0]["enabled"] is False
    assert client.put(f"/feeds/{feed['id']}", headers=auth["analyst"], json=payload).status_code == 200
    assert rule["id"]


def test_archiving_never_withdraws_published_snapshots(client, auth):
    location = area(client, auth)
    report(client, auth, location)
    payload = {
        "location_id": location["id"],
        "disease": "influenza",
        "date_from": str(date.today()),
        "date_to": str(date.today()),
        "title": "Reviewed area report",
        "public_name": "Reporting area",
        "summary": "Approved aggregate count for public review.",
        "methodology": "Reported counts for a reviewed reporting date and area.",
        "source_name": "Official source",
        "source_url": "https://example.com/source",
    }
    draft = client.post("/publications", headers=auth["analyst"], json=payload).json()
    assert (
        client.post(f"/publications/{draft['id']}/publish", headers=auth["admin"], json={"reviewed": True}).status_code
        == 200
    )
    assert client.post(f"/locations/{location['id']}/archive", headers=auth["analyst"]).status_code == 200
    assert client.get(f"/public/reports/{draft['id']}").status_code == 200
    assert client.post("/publications", headers=auth["analyst"], json=payload).status_code == 409
    assert client.post(f"/publications/{draft['id']}/withdraw", headers=auth["admin"]).status_code == 200


def test_delete_and_record_creation_are_serialized(client, auth):
    location = area(client, auth)
    with ThreadPoolExecutor(max_workers=2) as executor:
        remove = executor.submit(client.delete, f"/locations/{location['id']}", headers=auth["analyst"])
        create = executor.submit(report, client, auth, location)
        deleted, created = remove.result(), create.result()
    assert (deleted.status_code, created.status_code) in ((204, 422), (409, 201))
