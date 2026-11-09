from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.models import Case, LocationEvent
from app.services import laboratory
from app.services.surveillance import utcnow
from app.services.weekly_review import area_review

END = date(2025, 10, 25)


def area(client, auth, **extra):
    response = client.post(
        "/locations",
        headers=auth["analyst"],
        json={
            "name": "Alberta",
            "latitude": 53,
            "longitude": -113,
            "administrative_level": "province",
            "country_code": "CA",
            "region_code": "CA-AB",
            **extra,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def reports(client, auth, location, **extra):
    for day, count in [(END - timedelta(days=7), 100), (END, 150)]:
        response = client.post(
            "/cases",
            headers=auth["analyst"],
            json={
                "location_id": location["id"],
                "date": str(day),
                "disease": "influenza",
                "case_count": count,
                "source": "Reviewed provincial report",
                "reporting_period_days": 7,
                **extra,
            },
        )
        assert response.status_code == 201, response.text


def review(client, auth, location, **extra):
    return client.get(
        "/review/weekly",
        headers=auth["analyst"],
        params={"location_id": location["id"], "disease": "influenza", "date_to": str(END), **extra},
    )


def test_complete_week_comparison_rate_and_private_boundary(client, auth):
    location = area(
        client,
        auth,
        population=1000000,
        population_year=2025,
        population_source="https://example.com/population",
        population_area_confirmed=True,
    )
    reports(client, auth, location)
    result = review(client, auth, location).json()
    row = result["areas"][0]
    assert row["current"]["reported_cases"] == 150 and row["current"]["covered_days"] == 7
    assert row["previous"]["reported_cases"] == 100
    assert row["comparison"]["absolute_change"] == 50 and row["comparison"]["percent_change"] == 50
    assert row["rate"]["reported_cases_per_100000"] == 15
    assert result["historical"] and "total_cases" not in result
    assert client.get("/review/weekly").status_code == 401
    assert client.get("/review/weekly", headers=auth["reader"]).status_code == 403
    assert client.get("/review/laboratory?location_id=1", headers=auth["reader"]).status_code == 403
    assert review(client, auth, location, date_to=str(date.today() + timedelta(days=1))).status_code == 422
    assert review(client, auth, location, disease="   ").status_code == 422


@pytest.mark.parametrize(
    "extra",
    [
        {},
        {"population": 1000000},
        {
            "population": 1000000,
            "population_year": 2024,
            "population_source": "https://example.com",
            "population_area_confirmed": True,
        },
    ],
)
def test_unverified_or_different_year_denominator_never_produces_rate(client, auth, extra):
    location = area(client, auth, **extra)
    reports(client, auth, location)
    row = review(client, auth, location).json()["areas"][0]
    assert row["rate"]["reported_cases_per_100000"] is None and row["rate"]["unavailable_reason"]
    assert row["comparison"]["absolute_change"] == 50


def test_population_validation_and_change_audit(client, auth):
    assert (
        client.post(
            "/locations",
            headers=auth["analyst"],
            json={"name": "Invalid", "latitude": 0, "longitude": 0, "population_area_confirmed": True},
        ).status_code
        == 422
    )
    location = area(client, auth)
    response = client.put(
        f"/locations/{location['id']}",
        headers=auth["analyst"],
        json={
            **location,
            "population": 10000,
            "population_year": 2025,
            "population_source": "https://example.com/population",
            "population_area_confirmed": True,
        },
    )
    assert response.status_code == 200, response.text
    history = client.get(f"/locations/{location['id']}/history", headers=auth["analyst"]).json()
    assert history[0]["action"] == "population_update"
    assert history[0]["snapshot"]["before"]["population"] is None
    assert history[0]["snapshot"]["after"]["population"] == 10000


def test_partial_week_source_change_and_archived_areas_are_explicit(client, auth):
    location = area(client, auth)
    reports(client, auth, location, reporting_period_days=1)
    row = review(client, auth, location).json()["areas"][0]
    assert row["current"]["state"] == "incomplete" and row["comparison"]["absolute_change"] is None
    shifted = review(client, auth, location, date_to=str(END - timedelta(days=1))).json()["areas"][0]
    assert shifted["current"]["reported_cases"] == 100
    assert shifted["current"]["state"] == "incomplete"
    client.post(f"/locations/{location['id']}/archive", headers=auth["analyst"])
    assert review(client, auth, location).json()["areas"] == []


@pytest.mark.parametrize("mode", ["boundary", "source", "zero", "demo", "conflict"])
def test_comparison_edge_cases(mode):
    location = SimpleNamespace(
        id=1,
        name="Area",
        population=None,
        population_year=None,
        population_source=None,
        population_area_confirmed=False,
    )
    rows = [
        SimpleNamespace(
            date=END - timedelta(days=7),
            case_count=100,
            reporting_period_days=7,
            quality_status="valid",
            source="One source",
            provenance="source",
        ),
        SimpleNamespace(
            date=END,
            case_count=150,
            reporting_period_days=7,
            quality_status="valid",
            source="One source",
            provenance="source",
        ),
    ]
    end = END
    if mode == "boundary":
        end -= timedelta(days=1)
    if mode == "source":
        rows[0].source = "Different source"
    if mode == "zero":
        rows[0].case_count = 0
    if mode == "demo":
        rows[0].provenance = "demo"
    if mode == "conflict":
        rows[0].quality_status = "conflict"
    result = area_review(location, rows, end)
    if mode == "zero":
        assert result["comparison"]["absolute_change"] == 150 and result["comparison"]["percent_change"] is None
    else:
        assert result["comparison"]["absolute_change"] is None and result["comparison"]["unavailable_reason"]


def lab_rows():
    return [
        {
            "province": "Alberta",
            "date": str(END),
            "virus": "SARS-CoV-2",
            "tests": "100",
            "detections": "5",
            "percentpositive": "5.0",
        },
        {
            "province": "Alberta",
            "date": str(END - timedelta(days=7)),
            "virus": "Influenza",
            "tests": "100",
            "detections": "10",
            "percentpositive": "10",
        },
        {
            "province": "Canada",
            "date": str(END),
            "virus": "SARS-CoV-2",
            "tests": "9999",
            "detections": "999",
            "percentpositive": "10",
        },
    ]


def test_phac_context_keeps_metrics_geography_missingness_and_dates_separate(client, auth, database, monkeypatch):
    location = area(client, auth)
    monkeypatch.setattr(laboratory, "load_laboratory", lambda: (lab_rows(), utcnow()))
    response = client.get(
        "/review/laboratory", headers=auth["analyst"], params={"location_id": location["id"], "date_to": str(END)}
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["metric"] == "test_positivity" and result["unit"] == "percent"
    assert result["latest_report_date"] == str(END) and result["historical"]
    assert result["indicators"][0]["tests"] == 100 and result["indicators"][0]["percent_positive"] == 5
    assert result["indicators"][1]["percent_positive"] is None  # no carrying influenza forward
    assert result["indicators"][2]["percent_positive"] is None
    with Session(database) as db:
        assert db.scalar(select(func.count(Case.id))) == 0
        assert db.scalar(select(func.count(LocationEvent.id))) == 0
    city = area(client, auth, name="Calgary", administrative_level="city")
    assert (
        client.get("/review/laboratory", headers=auth["analyst"], params={"location_id": city["id"]}).status_code == 422
    )


@pytest.mark.parametrize(
    "change", [{"percentpositive": "NaN"}, {"percentpositive": "101"}, {"tests": "0"}, {"detections": "101"}]
)
def test_invalid_laboratory_values_fail_closed(change):
    rows = lab_rows()
    rows[0].update(change)
    location = SimpleNamespace(id=1, geographic_scope="regional", region_code="CA-AB", country_code="CA")
    with pytest.raises(Exception) as exc:
        laboratory.laboratory_context(location, END, rows, utcnow())
    assert exc.value.status_code == 502


def test_duplicate_phac_series_is_rejected():
    rows = lab_rows()
    rows.append(rows[0].copy())
    location = SimpleNamespace(id=1, geographic_scope="regional", region_code="CA-AB", country_code="CA")
    with pytest.raises(Exception) as exc:
        laboratory.laboratory_context(location, END, rows, utcnow())
    assert exc.value.status_code == 502


def test_source_failure_does_not_change_case_review(client, auth, monkeypatch):
    from fastapi import HTTPException

    location = area(client, auth)
    reports(client, auth, location)

    def unavailable():
        raise HTTPException(502, "Source unavailable")

    monkeypatch.setattr(laboratory, "load_laboratory", unavailable)
    assert (
        client.get("/review/laboratory", headers=auth["analyst"], params={"location_id": location["id"]}).status_code
        == 502
    )
    assert review(client, auth, location).json()["areas"][0]["comparison"]["absolute_change"] == 50


def test_population_migration_preserves_deleted_id_high_water_and_old_estimates(tmp_path, monkeypatch):
    import os
    import sqlite3
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    from app.core.config import get_settings

    if os.environ.get("TEST_DATABASE_URL"):
        pytest.skip("SQLite sequence preservation regression")
    path = tmp_path / "population-migration.db"
    monkeypatch.setattr(get_settings(), "database_url", f"sqlite:///{path}")
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "0009")
    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO locations (id,name,name_key,latitude,longitude,population) VALUES (1,'Existing','existing',0,0,1000)"
        )
        db.execute("INSERT INTO locations (id,name,name_key,latitude,longitude) VALUES (100,'Deleted','deleted',0,0)")
        db.execute("DELETE FROM locations WHERE id=100")
    command.upgrade(config, "head")
    with sqlite3.connect(path) as db:
        assert db.execute(
            "SELECT population,population_year,population_source,population_area_confirmed FROM locations WHERE id=1"
        ).fetchone() == (1000, None, None, 0)
        db.execute("INSERT INTO locations (name,name_key,latitude,longitude) VALUES ('Next','next',0,0)")
        assert db.execute("SELECT id FROM locations WHERE name_key='next'").fetchone()[0] > 100


def test_read_only_demo_has_three_scenarios_and_preserves_live_demo_safeguard(client, auth, database):
    from app.models.models import Location, Outbreak, Publication
    from app.services.weekly_review import reporting_window

    for scenario in ("complete", "incomplete", "population"):
        response = client.get("/review/demo", headers=auth["analyst"], params={"scenario": scenario})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["demonstration"] is True and result["scenario"] == scenario
        row = result["areas"][0]
        assert row["investigations"] == [] and row["location_id"] == 0
        if scenario == "incomplete":
            assert row["current"]["covered_days"] == 3 and row["current"]["reported_cases"] == 60
            assert row["comparison"]["absolute_change"] is None
            assert row["rate"]["reported_cases_per_100000"] is None
        else:
            assert row["current"]["reported_cases"] == 150
            assert row["comparison"]["absolute_change"] == 50 and row["comparison"]["percent_change"] == 50
            assert row["rate"]["reported_cases_per_100000"] == (15 if scenario == "complete" else None)
    assert client.get("/review/demo").status_code == 401
    assert client.get("/review/demo", headers=auth["reader"]).status_code == 403
    assert client.get("/review/demo?scenario=unknown", headers=auth["analyst"]).status_code == 422
    with Session(database) as db:
        for model in (Location, Case, Outbreak, Publication, LocationEvent):
            assert db.scalar(select(func.count(model.id))) == 0
    # The shared live calculation still withholds comparisons for demo-tagged records.
    location = SimpleNamespace(
        id=1,
        name="Demo",
        population=1000000,
        population_year=2025,
        population_source="https://example.com",
        population_area_confirmed=True,
    )
    rows = [
        SimpleNamespace(
            date=day,
            case_count=count,
            reporting_period_days=7,
            quality_status="valid",
            source="Demo data",
            provenance="demo",
        )
        for day, count in [(END - timedelta(days=7), 100), (END, 150)]
    ]
    assert reporting_window(rows, END - timedelta(days=6), END)["state"] == "demonstration"
    assert area_review(location, rows, END)["comparison"]["absolute_change"] is None
    assert area_review(location, rows, END)["rate"]["reported_cases_per_100000"] is None
