"""Separate source counts from analyst assessments; retain legacy labels in audit."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = depends_on = None


def upgrade():
    op.add_column("locations", sa.Column("region_code", sa.String(6), nullable=True))
    with op.batch_alter_table("cases") as batch:
        batch.drop_constraint("case_severity", type_="check")
        batch.create_check_constraint(
            "case_severity", "severity IN ('unassessed', 'low', 'medium', 'high', 'critical')"
        )
    connection = op.get_bind()
    # Feed-owned rows have never been explicitly corrected in this schema. Manual
    # corrections already relinquish ownership and retain their deliberate labels.
    cases = sa.table(
        "cases",
        sa.column("id"),
        sa.column("location_id"),
        sa.column("date", sa.Date),
        sa.column("disease"),
        sa.column("case_count"),
        sa.column("severity"),
        sa.column("source"),
        sa.column("reporting_period_days"),
        sa.column("feed_id"),
        sa.column("outbreak_id"),
    )
    audit = sa.table(
        "case_revisions",
        sa.column("case_id"),
        sa.column("feed_id"),
        sa.column("action"),
        sa.column("before", sa.JSON),
        sa.column("after", sa.JSON),
    )
    for row in connection.execute(
        sa.select(cases).where(cases.c.feed_id.is_not(None), cases.c.severity != "unassessed")
    ).mappings():
        before = dict(row)
        before["date"] = str(before["date"])
        after = {**before, "severity": "unassessed"}
        connection.execute(
            audit.insert().values(
                case_id=row["id"], feed_id=row["feed_id"], action="assessment_reset", before=before, after=after
            )
        )
    connection.execute(cases.update().where(cases.c.feed_id.is_not(None)).values(severity="unassessed"))
    connection.execute(sa.text("UPDATE feeds SET severity = 'unassessed'"))


def downgrade():
    # Do not silently manufacture low assessments or discard their audit trail.
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM cases WHERE severity = 'unassessed'")):
        raise RuntimeError("Review unassessed records before downgrading this schema")
    with op.batch_alter_table("cases") as batch:
        batch.drop_constraint("case_severity", type_="check")
        batch.create_check_constraint("case_severity", "severity IN ('low', 'medium', 'high', 'critical')")
    with op.batch_alter_table("locations") as batch:
        batch.drop_column("region_code")
