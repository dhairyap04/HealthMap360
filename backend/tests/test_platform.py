import json
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.models.models import Case, ImportBatch, Location, User


def upload(client, headers, text, mapping=None):
    return client.post(
        "/imports",
        headers=headers,
        files={"file": ("outbreaks.csv", text, "text/csv")},
        data={"mapping": json.dumps(mapping or {})},
    )


def test_health_and_openapi(client):
    assert client.get("/health").json() == {"status": "ok", "database": "ok"}
    assert "/imports" in client.get("/openapi.json").json()["paths"]


def test_registration_login_normalization_and_default_role(client):
    payload = {
        "username": "New_Reader",
        "email": "Reader@Example.com",
        "password": "long-password-123",
        "role": "admin",
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 201
    assert response.json()["user"]["role"] == "public"
    assert response.json()["user"]["username"] == "new_reader"
    assert client.post("/auth/register", json=payload).status_code == 409
    assert (
        client.post("/auth/login", json={"username": "NEW_READER", "password": payload["password"]}).status_code == 200
    )
    assert client.post("/auth/login", json={"username": "new_reader", "password": "wrong"}).status_code == 401
    assert client.post("/auth/register", json={**payload, "username": "other", "password": "short"}).status_code == 422


@pytest.mark.parametrize(
    "path", ["/locations", "/cases", "/cases/export", "/summary", "/resources", "/diseases", "/auth/users", "/imports"]
)
def test_data_requires_authentication(client, path):
    assert client.get(path).status_code == 401


def test_public_role_is_read_only(client, auth, sample):
    headers = auth["reader"]
    assert client.get("/cases", headers=headers).status_code == 200
    assert upload(client, headers, sample).status_code == 403
    assert (
        client.post("/locations", headers=headers, json={"name": "Test", "latitude": 0, "longitude": 0}).status_code
        == 403
    )
    assert client.delete("/resources/1", headers=headers).status_code == 403
    assert client.get("/auth/users", headers=headers).status_code == 403


def test_import_persists_summary_map_filters_and_export(client, auth, sample):
    response = upload(client, auth["analyst"], sample)
    assert response.status_code == 201, response.text
    assert response.json()["imported"] == 2
    summary = client.get("/summary", headers=auth["reader"]).json()
    assert summary["total_cases"] == 23
    assert summary["observations"] == 2
    assert summary["affected_locations"] == 2
    assert summary["locations"][0]["name"] == "Edmonton"
    assert summary["locations"][0]["latitude"] == 53.5461
    assert client.get("/summary?disease=INFLUENZA", headers=auth["reader"]).json()["total_cases"] == 14
    assert (
        client.get("/summary?severity=high&date_from=2026-11-02&date_to=2026-11-02", headers=auth["reader"]).json()[
            "total_cases"
        ]
        == 9
    )
    assert client.get("/cases?date_from=2026-12-01&date_to=2026-11-01", headers=auth["reader"]).status_code == 422
    exported = client.get("/cases/export?disease=influenza", headers=auth["reader"])
    assert exported.status_code == 200
    assert "Edmonton" in exported.text and "Calgary" not in exported.text
    assert client.get("/imports", headers=auth["analyst"]).json()[0]["imported"] == 2


def test_exact_duplicates_skip_and_conflicts_are_atomic(client, auth, sample, database):
    assert upload(client, auth["analyst"], sample).status_code == 201
    second = upload(client, auth["analyst"], sample).json()
    assert second["imported"] == 0 and second["skipped"] == 2
    conflict = sample.replace("influenza,14", "influenza,99")
    response = upload(client, auth["analyst"], conflict)
    assert response.status_code == 422
    assert "Conflicting observation" in response.text
    with Session(database) as db:
        assert db.scalar(select(func.count(Case.id))) == 2
        assert db.scalar(select(func.count(ImportBatch.id))) == 2


def test_full_file_beyond_100_rows_and_pagination(client, auth, sample):
    header = sample.splitlines()[0]
    text = header + "\n" + "\n".join(f"2026-11-01,Location {n},influenza,1,low,Test,0,{n / 10}" for n in range(151))
    assert upload(client, auth["analyst"], text).json()["imported"] == 151
    data = client.get("/cases?page=2&page_size=100", headers=auth["reader"]).json()
    assert data["total"] == 151 and len(data["items"]) == 51
    assert client.get("/summary", headers=auth["reader"]).json()["total_cases"] == 151


def test_invalid_row_after_100_rolls_back_everything(client, auth, sample, database):
    header = sample.splitlines()[0]
    text = header + "\n" + "\n".join(f"2026-11-01,Location {n},influenza,1,low,Test,0,0" for n in range(101))
    text += "\n2026-99-99,Invalid,influenza,5,high,Test,0,0"
    assert upload(client, auth["analyst"], text).status_code == 422
    with Session(database) as db:
        for model in [Case, Location, ImportBatch]:
            assert db.scalar(select(func.count(model.id))) == 0


@pytest.mark.parametrize(
    "text",
    [
        "date,location,disease,case_count,severity\n2026-02-30,Edmonton,flu,3,low",
        "date,location,disease,case_count,severity\n2026-11-01,Unknown,flu,3,low",
        "date,date\n2026-11-01,2026-11-01",
        "date,location,disease,case_count,severity,latitude,longitude\n2026-11-01,X,flu,-1,low,0,0",
        "date,location,disease,case_count,severity,latitude,longitude\n2026-11-01,X,flu,1,low,91,0",
        "date,location,disease,case_count,severity,latitude,longitude\n2026-11-01,X,flu,1,low,nan,0",
        "date,location,disease,case_count,severity,latitude,longitude\n2026-11-01,X,flu,1,low,0,0,extra",
        "date,location,disease,case_count,severity,latitude,longitude\n2026-11-01,X,flu,1,low,0",
        "date,location,disease,case_count,severity\n",
    ],
)
def test_bad_csv_rejected(client, auth, text):
    assert upload(client, auth["analyst"], text).status_code == 422


def test_mapping_existing_location_and_zero_counts(client, auth):
    created = client.post(
        "/locations", headers=auth["analyst"], json={"name": "Edmonton", "latitude": 53, "longitude": -113}
    )
    assert created.status_code == 201
    text = "day,city,illness,count,level\n2026-11-01, EDMONTON ,Flu,0,LOW"
    mapping = {"date": "day", "location": "city", "disease": "illness", "case_count": "count", "severity": "level"}
    assert upload(client, auth["analyst"], text, mapping).json()["imported"] == 1
    assert len(client.get("/locations", headers=auth["reader"]).json()) == 1
    assert client.get("/cases", headers=auth["reader"]).json()["items"][0]["case_count"] == 0


def test_resource_allocation_and_case_corrections(client, auth, sample):
    upload(client, auth["analyst"], sample)
    case = client.get("/cases", headers=auth["reader"]).json()["items"][0]
    location_id = case["location_id"]
    payload = {"type": "Masks", "quantity": 100}
    created = client.post("/resources", headers=auth["analyst"], json=payload)
    assert created.status_code == 201, created.text
    resource_id = created.json()["id"]
    allocated = {**payload, "location_id": location_id, "allocated_date": "2026-11-07"}
    assert client.put(f"/resources/{resource_id}", headers=auth["analyst"], json=allocated).status_code == 200
    assert (
        client.get(f"/resources?location_id={location_id}", headers=auth["reader"]).json()[0]["location"]["id"]
        == location_id
    )
    assert client.get(f"/summary?location_id={location_id}", headers=auth["reader"]).json()["resource_units"] == 100
    assert client.post("/resources", headers=auth["analyst"], json={"type": "Beds", "quantity": -1}).status_code == 422
    assert client.post("/resources", headers=auth["analyst"], json={**payload, "location_id": 9999}).status_code == 422
    assert (
        client.post("/resources", headers=auth["analyst"], json={**payload, "allocated_date": "2026-11-07"}).status_code
        == 422
    )
    assert (
        client.put(f"/cases/{case['id']}", headers=auth["analyst"], json={**case, "case_count": 25}).status_code == 200
    )
    assert client.get("/summary", headers=auth["reader"]).json()["total_cases"] == 39
    assert client.delete(f"/resources/{resource_id}", headers=auth["analyst"]).status_code == 204
    assert client.delete(f"/cases/{case['id']}", headers=auth["analyst"]).status_code == 204


def test_expired_and_tampered_tokens_rejected(client, auth):
    assert (
        client.get("/auth/me", headers={"Authorization": auth["admin"]["Authorization"] + "tampered"}).status_code
        == 401
    )
    token = jwt.encode(
        {"sub": "1", "ver": 0, "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        get_settings().secret_key,
        algorithm="HS256",
    )
    assert client.get("/auth/me", headers={"Authorization": "Bearer " + token}).status_code == 401


def test_role_changes_revoke_sessions_and_prevent_self_demotion(client, auth, database):
    users = client.get("/auth/users", headers=auth["admin"]).json()
    reader = next(u for u in users if u["username"] == "reader")
    admin = next(u for u in users if u["username"] == "admin")
    assert (
        client.patch(f"/auth/users/{reader['id']}", headers=auth["analyst"], json={"role": "analyst"}).status_code
        == 403
    )
    assert (
        client.patch(f"/auth/users/{reader['id']}", headers=auth["admin"], json={"role": "analyst"}).status_code == 200
    )
    assert client.get("/auth/me", headers=auth["reader"]).status_code == 401
    assert client.patch(f"/auth/users/{admin['id']}", headers=auth["admin"], json={"role": "public"}).status_code == 400
    with Session(database) as db:
        assert db.get(User, reader["id"]).role == "analyst"


def test_logout_and_password_change_revoke_tokens(client, auth):
    assert client.post("/auth/logout", headers=auth["reader"]).status_code == 204
    assert client.get("/auth/me", headers=auth["reader"]).status_code == 401
    assert (
        client.post(
            "/auth/password",
            headers=auth["analyst"],
            json={"current_password": "wrong", "new_password": "new-password-123"},
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/auth/password",
            headers=auth["analyst"],
            json={"current_password": "test-password-123", "new_password": "new-password-123"},
        ).status_code
        == 204
    )
    assert client.get("/auth/me", headers=auth["analyst"]).status_code == 401
    assert client.post("/auth/login", json={"username": "analyst", "password": "new-password-123"}).status_code == 200


def test_import_size_and_row_limits(client, auth, sample, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_import_rows", 1)
    assert upload(client, auth["analyst"], sample).status_code == 413
    monkeypatch.setattr(get_settings(), "max_upload_bytes", 10)
    assert upload(client, auth["analyst"], sample).status_code == 413


def test_csv_export_neutralizes_formulas(client, auth):
    text = "date,location,disease,case_count,severity,latitude,longitude\n2026-11-01,=EVIL(),flu,1,low,0,0"
    assert upload(client, auth["analyst"], text).status_code == 201
    assert "'=EVIL()" in client.get("/cases/export", headers=auth["reader"]).text


def test_production_requires_secret():
    with pytest.raises(ValueError):
        Settings(environment="production", secret_key="", _env_file=None)


def test_location_updates_are_normalized_and_unique(client, auth):
    payload = {"name": "Edmonton", "latitude": 53, "longitude": -113}
    first = client.post("/locations", headers=auth["analyst"], json=payload).json()
    assert client.post("/locations", headers=auth["analyst"], json={**payload, "name": " EDMONTON "}).status_code == 409
    assert (
        client.put(f"/locations/{first['id']}", headers=auth["analyst"], json={**payload, "latitude": 54}).json()[
            "latitude"
        ]
        == 54
    )


def test_source_changes_are_conflicting_not_silently_discarded(client, auth, sample):
    assert upload(client, auth["analyst"], sample).status_code == 201
    assert upload(client, auth["analyst"], sample.replace(",Test,", ",Different source,")).status_code == 422


def test_coordinate_conflicts_are_atomic(client, auth):
    text = "date,location,disease,case_count,severity,latitude,longitude\n2026-11-01,City,flu,1,low,0,0\n2026-11-02,City,flu,1,low,1,0"
    assert upload(client, auth["analyst"], text).status_code == 422
    assert client.get("/locations", headers=auth["reader"]).json() == []


def test_short_normalized_username_rejected(client):
    assert (
        client.post(
            "/auth/register", json={"username": " a ", "email": "reader@example.com", "password": "test-password-123"}
        ).status_code
        == 422
    )
