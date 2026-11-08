from datetime import date, timedelta
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models.models import Case, CaseRevision, Feed


def add_place(client, auth, name, level, **extra):
    response = client.post(
        "/locations",
        headers=auth["analyst"],
        json={
            "name": name,
            "latitude": 53,
            "longitude": -113,
            "administrative_level": level,
            **extra,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def add_report(client, auth, location, count, day=None, **extra):
    response = client.post(
        "/cases",
        headers=auth["analyst"],
        json={
            "location_id": location["id"],
            "date": str(day or date.today()),
            "disease": "covid-19",
            "case_count": count,
            **extra,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_geography_never_adds_country_to_its_cities(client, auth):
    city = add_place(client, auth, "Edmonton", "city")
    region = add_place(client, auth, "Alberta", "province", country_code="CA", region_code="CA-AB")
    country = add_place(client, auth, "Canada", "country", country_code="CA")
    assert [x["geographic_scope"] for x in [city, region, country]] == ["local", "regional", "national"]
    for place, count in [(city, 5), (region, 500), (country, 50000)]:
        add_report(client, auth, place, count)
    for scope, count in [("local", 5), ("regional", 500), ("national", 50000)]:
        data = client.get("/summary", headers=auth["analyst"], params={"geographic_scope": scope}).json()
        assert data["total_cases"] == count
        assert data["affected_locations"] == 1
        assert len(data["locations"]) == 1
        rows = client.get("/cases", headers=auth["analyst"], params={"geographic_scope": scope}).json()
        assert rows["total"] == 1 and rows["items"][0]["case_count"] == count
        exported = client.get("/cases/export", headers=auth["analyst"], params={"geographic_scope": scope})
        assert len(exported.text.splitlines()) == 2
    assert client.get("/summary", headers=auth["analyst"]).json()["total_cases"] == 5
    # A location selected under another geography cannot leak national numbers.
    assert (
        client.get("/summary", headers=auth["analyst"], params={"location_id": country["id"]}).json()["total_cases"]
        == 0
    )


def test_windows_expose_historical_dates_and_preserve_missing_reports(client, auth):
    country = add_place(client, auth, "Canada", "country", country_code="CA")
    last = date(2021, 12, 26)
    add_report(client, auth, country, 80, last, reporting_period_days=7, source="WHO fixture")
    add_report(client, auth, country, 20, last - timedelta(days=7), reporting_period_days=7)
    current = client.get("/summary?geographic_scope=national", headers=auth["analyst"]).json()
    assert current["observations"] == 0 and current["view"]["historical"] is True
    assert current["view"]["latest_report_date"] == str(last)
    latest = client.get("/summary?geographic_scope=national&time_window=latest", headers=auth["analyst"]).json()
    assert latest["total_cases"] == 80 and latest["view"]["date_to"] == str(last)
    assert latest["view"]["date_from"] == str(last - timedelta(days=6))
    assert latest["view"]["reporting_periods"] == [7]
    history = client.get("/summary?geographic_scope=national&time_window=historical", headers=auth["analyst"]).json()
    assert history["total_cases"] == 100 and len(history["trend"]) == 2
    assert history["by_severity"] == [{"severity": "unassessed", "cases": 100}]
    assert client.get("/summary?geographic_scope=all", headers=auth["analyst"]).status_code == 422
    assert client.get("/summary?time_window=unknown", headers=auth["analyst"]).status_code == 422
    assert client.get("/summary?date_from=2026-02-02&date_to=2026-01-01", headers=auth["analyst"]).status_code == 422


def test_latest_window_is_common_across_locations_and_diseases(client, auth):
    a = add_place(client, auth, "A", "city")
    b = add_place(client, auth, "B", "city")
    add_report(client, auth, a, 10)
    add_report(client, auth, b, 100, date.today() - timedelta(days=50))
    data = client.get("/summary?time_window=latest", headers=auth["analyst"]).json()
    assert data["total_cases"] == 10 and data["affected_locations"] == 1
    empty = client.get("/summary?disease=missing&time_window=latest", headers=auth["analyst"]).json()
    assert empty["observations"] == 0 and empty["view"]["latest_report_date"] is None


def test_csv_assessment_is_optional_but_priorities_remain_required_levels(client, auth):
    csv = f"date,location,disease,case_count,latitude,longitude\n{date.today()},Edmonton,influenza,2,53,-113\n"
    result = client.post("/imports", headers=auth["analyst"], files={"file": ("optional.csv", csv, "text/csv")})
    assert result.status_code == 201, result.text
    assert client.get("/cases", headers=auth["analyst"]).json()["items"][0]["severity"] == "unassessed"
    response = client.post(
        "/alert-rules",
        headers=auth["analyst"],
        json={
            "name": "Invalid priority",
            "threshold": 1,
            "window_days": 7,
            "severity": "unassessed",
        },
    )
    assert response.status_code == 422


def test_existing_feed_labels_are_audited_and_manual_labels_retained(database):
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.downgrade(config, "0004")
    with database.begin() as db:
        db.execute(
            text(
                "INSERT INTO users (id,username,email,role,hashed_password,token_version) VALUES (1,'migration','migration@example.com','admin','unused',0)"
            )
        )
        db.execute(
            text(
                "INSERT INTO locations (id,name,name_key,latitude,longitude,administrative_level,country_code) VALUES (1,'Canada','canada',56,-106,'country','CA')"
            )
        )
        db.execute(
            text(
                "INSERT INTO feeds (id,name,provider,country_code,location_id,severity,start_date,interval_minutes,enabled,created_by) VALUES (1,'WHO','who_covid_weekly','CA',1,'low','2021-01-01',1440,true,1)"
            )
        )
        db.execute(
            text(
                "INSERT INTO cases (id,location_id,date,disease,case_count,severity,reporting_period_days,feed_id) VALUES (1,1,'2021-12-26','covid-19',123,'low',7,1),(2,1,'2021-12-19','covid-19',4,'high',7,NULL)"
            )
        )
    command.upgrade(config, "head")
    command.upgrade(config, "head")
    with Session(database) as db:
        assert db.scalar(select(func.sum(Case.case_count))) == 127
        assert db.get(Case, 1).severity == "unassessed"
        assert db.get(Case, 2).severity == "high"
        audit = db.scalar(select(CaseRevision).where(CaseRevision.action == "assessment_reset"))
        assert audit.case_id == 1 and audit.before["severity"] == "low" and audit.after["severity"] == "unassessed"
        assert db.scalar(select(func.count(CaseRevision.id))) == 1
        assert db.get(Feed, 1).severity == "unassessed"


def test_historical_date_filter_does_not_misrepresent_source_freshness(client, auth):
    country = add_place(client, auth, "Canada", "country", country_code="CA")
    add_report(client, auth, country, 100, date(2021, 12, 26))
    add_report(client, auth, country, 1)
    data = client.get(
        "/summary",
        headers=auth["analyst"],
        params={
            "geographic_scope": "national",
            "time_window": "historical",
            "date_from": "2021-01-01",
            "date_to": "2021-12-31",
        },
    ).json()
    assert data["total_cases"] == 100
    assert data["view"]["latest_report_date"] == str(date.today())
    assert data["view"]["historical"] is False
    assert data["view"]["date_to"] == "2021-12-31"
