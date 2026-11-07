import os
import tempfile
import uuid
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///" + str(Path(tempfile.gettempdir()) / "healthmap360-tests-unused.db")
os.environ["SECRET_KEY"] = "test-secret-key-only-not-for-production-123456789"

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.auth.security import get_password_hash
from app.core.config import get_settings
from app.db.session import get_db
from app.main import app
from app.models.models import User


@pytest.fixture
def database(tmp_path, monkeypatch):
    postgres = os.environ.get("TEST_DATABASE_URL")
    admin_engine = None
    if postgres:
        schema = "hm_test_" + uuid.uuid4().hex
        admin_engine = create_engine(postgres)
        with admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        url = (
            make_url(postgres)
            .update_query_dict({"options": f"-csearch_path={schema}"})
            .render_as_string(hide_password=False)
        )
    else:
        url = f"sqlite:///{tmp_path / 'test.db'}"
    monkeypatch.setattr(get_settings(), "database_url", url)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    engine = create_engine(url, connect_args={"check_same_thread": False} if not postgres else {})
    if not postgres:

        @event.listens_for(engine, "connect")
        def foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")

    yield engine
    engine.dispose()
    if admin_engine:
        with admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin_engine.dispose()


@pytest.fixture
def client(database):
    def override_db():
        with Session(database, expire_on_commit=False) as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def auth(client, database):
    with Session(database) as db:
        db.add_all(
            [
                User(
                    username=name,
                    email=f"{name}@example.com",
                    role=role,
                    hashed_password=get_password_hash("test-password-123"),
                )
                for name, role in [("admin", "admin"), ("analyst", "analyst"), ("reader", "public")]
            ]
        )
        db.commit()
    return {
        name: {
            "Authorization": "Bearer "
            + client.post("/auth/login", json={"username": name, "password": "test-password-123"}).json()[
                "access_token"
            ]
        }
        for name in ["admin", "analyst", "reader"]
    }


@pytest.fixture
def sample():
    return "date,location,disease,case_count,severity,source,latitude,longitude\n2026-11-01,Edmonton,influenza,14,medium,Test,53.5461,-113.4938\n2026-11-02,Calgary,covid-19,9,high,Test,51.0447,-114.0719\n"
