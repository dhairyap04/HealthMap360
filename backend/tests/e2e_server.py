"""Disposable local server for browser tests; never connects to the user's database."""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory(prefix="healthmap-e2e-") as directory:
    os.environ["DATABASE_URL"] = f"sqlite:///{directory}/browser.db"
    os.environ["SECRET_KEY"] = "browser-test-only-secret-not-for-production-12345"
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from alembic import command
    from alembic.config import Config

    from app.auth.security import get_password_hash
    from app.db.session import SessionLocal
    from app.models.models import User

    command.upgrade(Config(str(Path(__file__).resolve().parents[1] / "alembic.ini")), "head")
    with SessionLocal() as db:
        db.add(
            User(
                username="browser_admin",
                email="browser@example.com",
                role="admin",
                hashed_password=get_password_hash("browser-test-password"),
            )
        )
        db.commit()
    result = subprocess.run(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8001"],
        check=False,
        cwd=Path(__file__).resolve().parents[1],
    )
    sys.exit(result.returncode)
