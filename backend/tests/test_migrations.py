from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.core.config import get_settings


def legacy_database(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'legacy.db'}"
    monkeypatch.setattr(get_settings(), "database_url", url)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "0001")
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE alembic_version"))
        connection.execute(text("CREATE INDEX ix_cases_date ON cases (date)"))
        connection.execute(text("INSERT INTO locations (id,name,latitude,longitude) VALUES (1,' Edmonton ',53,-113)"))
        connection.execute(
            text("INSERT INTO cases (location_id,date,case_count,severity) VALUES (1,'2026-11-01',10,'high')")
        )
        connection.execute(
            text(
                "INSERT INTO users (username,email,role,hashed_password) VALUES ('Legacy','Legacy@Example.com','public','preserved-hash')"
            )
        )
    return config, engine


def test_legacy_schema_adoption_preserves_records_and_is_repeatable(tmp_path, monkeypatch):
    config, engine = legacy_database(tmp_path, monkeypatch)
    command.upgrade(config, "head")
    command.upgrade(config, "head")
    with engine.connect() as connection:
        assert connection.execute(text("SELECT name_key FROM locations")).scalar() == "edmonton"
        assert connection.execute(text("SELECT disease FROM cases")).scalar() == "unspecified"
        assert connection.execute(text("SELECT case_count FROM cases")).scalar() == 10
        assert connection.execute(text("SELECT hashed_password FROM users")).scalar() == "preserved-hash"
        assert connection.execute(text("SELECT username FROM users")).scalar() == "legacy"
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0003"
    engine.dispose()


@pytest.mark.parametrize(
    "invalid_sql,expected",
    [
        ("INSERT INTO locations (name,latitude,longitude) VALUES ('EDMONTON',0,0)", "duplicate normalized names"),
        (
            "INSERT INTO cases (location_id,date,case_count,severity) VALUES (1,'2026-11-01',1,'low')",
            "duplicate location/date",
        ),
        ("UPDATE cases SET case_count=-1", "Invalid legacy case"),
    ],
)
def test_legacy_ambiguity_stops_before_schema_changes(tmp_path, monkeypatch, invalid_sql, expected):
    config, engine = legacy_database(tmp_path, monkeypatch)
    with engine.begin() as connection:
        connection.execute(text(invalid_sql))
    with pytest.raises(RuntimeError, match=expected):
        command.upgrade(config, "head")
    assert "name_key" not in {column["name"] for column in inspect(engine).get_columns("locations")}
    engine.dispose()
