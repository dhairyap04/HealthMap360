"""Explainable, private weekly review; no predictions or cross-area aggregation."""

from datetime import timedelta

from app.services.observations import interval


def reporting_window(rows, start, end):
    overlapping = [row for row in rows if interval(row)[0] <= end and row.date >= start]
    included = [row for row in overlapping if interval(row)[0] >= start and row.date <= end]
    covered = set()
    duplicate_days = False
    for row in included:
        first, last = interval(row)
        days = {first + timedelta(days=i) for i in range((last - first).days + 1)}
        duplicate_days |= bool(covered & days)
        covered.update(days)
    sources = sorted({(row.source or "").strip() for row in included})
    periods = sorted({row.reporting_period_days for row in included})
    if any(row.quality_status != "valid" for row in overlapping) or duplicate_days:
        state = "conflict"
    elif len(overlapping) != len(included):
        state = "boundary_overlap"
    elif not included:
        state = "missing"
    elif len(covered) != 7:
        state = "incomplete"
    elif len(periods) != 1:
        state = "mixed_cadence"
    elif len(sources) != 1 or not sources[0]:
        state = "source_review"
    elif any(row.provenance == "demo" for row in included):
        state = "demonstration"
    else:
        state = "complete"
    return {
        "date_from": start,
        "date_to": end,
        "reported_cases": sum(row.case_count for row in included if row.quality_status == "valid")
        if included
        else None,
        "covered_days": len(covered),
        "observations": len(included),
        "state": state,
        "sources": sources,
        "reporting_periods": periods,
    }


def area_review(location, rows, end, *, illustrative=False):
    start = end - timedelta(days=6)
    current = reporting_window(rows, start, end)
    previous = reporting_window(rows, start - timedelta(days=7), start - timedelta(days=1))
    eligible_states = {"complete", "demonstration"} if illustrative else {"complete"}
    reason = None
    if current["state"] not in eligible_states or previous["state"] not in eligible_states:
        reason = "Both weeks need complete, non-conflicting, sourced coverage before comparison."
    elif current["sources"] != previous["sources"]:
        reason = "The reporting source changed between weeks."
    elif current["reporting_periods"] != previous["reporting_periods"]:
        reason = "The reporting cadence changed between weeks."
    delta = current["reported_cases"] - previous["reported_cases"] if not reason else None
    percentage = (
        round(delta / previous["reported_cases"] * 100, 1) if not reason and previous["reported_cases"] else None
    )
    rate_reason = None
    if current["state"] not in eligible_states:
        rate_reason = "A complete, sourced reporting week is required."
    elif not (
        location.population
        and location.population_year
        and location.population_source
        and location.population_area_confirmed
    ):
        rate_reason = "Add a population, reference year, source URL and matching-area confirmation in Settings."
    elif not start.year == end.year == location.population_year:
        rate_reason = "The population reference year must match the entire reporting week."
    rate = round(current["reported_cases"] / location.population * 100000, 2) if not rate_reason else None
    return {
        "location_id": location.id,
        "location_name": location.name,
        "current": current,
        "previous": previous,
        "comparison": {"absolute_change": delta, "percent_change": percentage, "unavailable_reason": reason},
        "rate": {
            "reported_cases_per_100000": rate,
            "unavailable_reason": rate_reason,
            "population": location.population,
            "reference_year": location.population_year,
            "source_url": location.population_source,
            "area_confirmed": location.population_area_confirmed,
        },
    }
