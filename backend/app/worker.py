"""Durable due-feed processing and in-app alert evaluation. Run one or more workers."""

import argparse
import logging
import time

from sqlalchemy import or_, select

from app.db.session import SessionLocal
from app.models.models import Feed
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
        db.commit()


def main():
    parser = argparse.ArgumentParser(description="Run scheduled feed synchronization and alert checks")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            run_once()
        except Exception:
            logger.exception("Worker tick failed; retrying")
        if args.once:
            break
        time.sleep(60)


if __name__ == "__main__":
    main()
