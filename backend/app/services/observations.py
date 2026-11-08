"""Canonical observation policy. Lock reporting areas before validating any writer."""

from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select, update

from app.models.models import Case, Location


def lock_locations(db, ids):
    # UPDATE acquires row locks on PostgreSQL and the write lock on SQLite before
    # reading intervals. Every writer uses the same sorted lock order.
    for location_id in sorted(set(ids)):
        db.execute(update(Location).where(Location.id == location_id).values(name_key=Location.name_key))


def interval(record):
    return record.date - timedelta(days=record.reporting_period_days - 1), record.date


def validate_intervals(db, candidates, excluded_ids=()):
    candidates = list(candidates)
    by_area = {}
    for candidate in candidates:
        by_area.setdefault((candidate.location_id, candidate.disease), []).append(candidate)
    for (location_id, disease), incoming in by_area.items():
        stored = list(
            db.scalars(
                select(Case).where(
                    Case.location_id == location_id, Case.disease == disease, Case.id.not_in(excluded_ids)
                )
            )
        )
        for index, row in enumerate(incoming):
            start, end = interval(row)
            for other in [*stored, *incoming[:index]]:
                other_start, other_end = interval(other)
                if start <= other_end and other_start <= end:
                    raise HTTPException(
                        409,
                        f"Overlapping {disease} reports at location {location_id}: {start}–{end} conflicts with {other_start}–{other_end}. Review the existing record and source before replacing it; nothing was saved.",
                    )


def classify_provenance(source, feed_id=None):
    if source and any(term in source.casefold() for term in ("demonstration", "sample data", "synthetic", "demo data")):
        return "demo"
    return "source" if feed_id else "unverified"
