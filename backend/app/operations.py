"""Backup/restore and scheduler monitoring. No credentials in command arguments."""

import argparse
import hashlib
import json
import os
import sqlite3
import subprocess
from pathlib import Path

from sqlalchemy import create_engine, inspect, select
from sqlalchemy.engine import make_url

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.models import Feed, WorkerHeartbeat
from app.services.surveillance import utcnow


def pg_environment(url):
    values = os.environ.copy()
    for key, value in {
        "PGHOST": url.host,
        "PGPORT": str(url.port or 5432),
        "PGUSER": url.username,
        "PGPASSWORD": url.password,
        "PGDATABASE": url.database,
    }.items():
        if value is not None:
            values[key] = value
    if url.query.get("sslmode"):
        values["PGSSLMODE"] = url.query["sslmode"]
    return values


def backup(url, output):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise RuntimeError("Backup path already exists; choose a new filename")
    # Reserve mode 0600 before either engine writes any bytes.
    output.touch(mode=0o600)
    try:
        if url.drivername.startswith("sqlite"):
            with sqlite3.connect(url.database) as source, sqlite3.connect(output) as target:
                source.backup(target)
        else:
            subprocess.run(
                ["pg_dump", "--format=custom", "--no-owner", "--no-acl", "--file", str(output)],
                env=pg_environment(url),
                check=True,
            )
        output.with_suffix(output.suffix + ".sha256").write_text(
            hashlib.file_digest(output.open("rb"), "sha256").hexdigest()
        )
    except Exception:
        output.unlink(missing_ok=True)
        raise


def restore(url, source):
    source = Path(source).resolve()
    expected = source.with_suffix(source.suffix + ".sha256").read_text().strip()
    if hashlib.file_digest(source.open("rb"), "sha256").hexdigest() != expected:
        raise RuntimeError("Backup checksum does not match")
    engine = create_engine(url)
    try:
        if inspect(engine).get_table_names():
            raise RuntimeError("Restore target must be an empty disposable database")
    finally:
        engine.dispose()
    if url.drivername.startswith("sqlite"):
        with sqlite3.connect(source) as saved, sqlite3.connect(url.database) as target:
            saved.backup(target)
        with sqlite3.connect(url.database) as restored:
            if (
                restored.execute("PRAGMA integrity_check").fetchone()[0] != "ok"
                or restored.execute("PRAGMA foreign_key_check").fetchall()
            ):
                raise RuntimeError("Restored database failed integrity checks")
    else:
        subprocess.run(
            ["pg_restore", "--no-owner", "--no-acl", "--exit-on-error", "--dbname", url.database, str(source)],
            env=pg_environment(url),
            check=True,
        )


def monitor():
    with SessionLocal() as db:
        heartbeat = db.get(WorkerHeartbeat, "scheduler")
        tick = heartbeat.last_tick_at if heartbeat else None
        if tick and tick.tzinfo is None:
            tick = tick.replace(tzinfo=utcnow().tzinfo)
        online = bool(tick and (utcnow() - tick).total_seconds() < 300)
        failures = list(db.scalars(select(Feed.id).where(Feed.enabled.is_(True), Feed.last_error.is_not(None))))
        print(json.dumps({"worker_online": online, "failed_enabled_feeds": len(failures), "checked_at": str(utcnow())}))
        return online and not failures


def main():
    parser = argparse.ArgumentParser(
        description="Use DATABASE_URL for the intended database. Restore refuses any nonempty target."
    )
    parser.add_argument("command", choices=["backup", "restore", "monitor"])
    parser.add_argument("--file")
    args = parser.parse_args()
    if args.command == "monitor":
        raise SystemExit(0 if monitor() else 1)
    if not args.file:
        parser.error("--file is required")
    url = make_url(get_settings().database_url)
    if args.command == "backup":
        backup(url, args.file)
    else:
        restore(url, args.file)
    print(args.command + " completed")


if __name__ == "__main__":
    main()
