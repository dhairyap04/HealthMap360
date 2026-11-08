"""Durable due-feed processing and in-app alert evaluation. Run one or more workers."""

import argparse
import logging
import time
from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.db.session import SessionLocal
from app.models.models import Feed, WorkerHeartbeat
from app.services.alerts import evaluate_alerts
from app.services.feeds import sync_feed
from app.services.surveillance import utcnow

logger = logging.getLogger("healthmap.worker")


def run_once():
    with SessionLocal() as db:
        now = utcnow()
        ids = db.scalars(
            select(Feed.id).where(
                Feed.enabled.is_(True),
                or_(Feed.next_sync_at.is_(None), Feed.next_sync_at <= now),
                or_(Feed.lease_until.is_(None), Feed.lease_until < now),
            )
        ).all()
    for feed_id in ids:
        try:
            with SessionLocal() as db:
                run = sync_feed(db, feed_id)
                logger.info("Feed %s: %s (%s)", feed_id, run.status, run.message)
        except Exception:
            logger.exception("Could not process feed %s", feed_id)
    with SessionLocal() as db:
        evaluate_alerts(db)
        insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
        now = utcnow()
        db.execute(
            insert(WorkerHeartbeat)
            .values(id="scheduler", last_tick_at=now)
            .on_conflict_do_update(index_elements=["id"], set_={"last_tick_at": now})
        )
        db.commit()


def main():
    parser = argparse.ArgumentParser(description="Run scheduled feed synchronization and alert checks")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--health", action="store_true")
    args = parser.parse_args()
    if args.health:
        with SessionLocal() as db:
            heartbeat = db.get(WorkerHeartbeat, "scheduler")
            tick = heartbeat.last_tick_at if heartbeat else None
            aware = tick.replace(tzinfo=utcnow().tzinfo) if tick and tick.tzinfo is None else tick
            raise SystemExit(0 if aware and utcnow() - aware < timedelta(minutes=5) else 1)
    logging.basicConfig(level=logging.INFO)
    if args.once:
        run_once()
        return
    while True:
        try:
            run_once()
        except Exception:
            logger.exception("Worker tick failed; retrying")
        time.sleep(60)


if __name__ == "__main__":
    main()
