"""One geography classification shared by SQL aggregates and location responses."""

from sqlalchemy import case, func

from app.models.models import Location

NATIONAL = ("country",)
REGIONAL = ("state", "province", "region", "territory", "administrative")
LOCAL = (
    "",
    "city",
    "town",
    "village",
    "municipality",
    "hamlet",
    "suburb",
    "borough",
    "county",
    "address",
    "house",
    "building",
    "postcode",
    "locality",
    "district",
    "neighbourhood",
)


def scope_for(level):
    value = (level or "").strip().lower()
    return (
        "national"
        if value in NATIONAL
        else "regional"
        if value in REGIONAL
        else "local"
        if value in LOCAL
        else "unclassified"
    )


def scope_expression():
    level = func.lower(func.trim(func.coalesce(Location.administrative_level, "")))
    return case(
        (level.in_(NATIONAL), "national"),
        (level.in_(REGIONAL), "regional"),
        (level.in_(LOCAL), "local"),
        else_="unclassified",
    )
