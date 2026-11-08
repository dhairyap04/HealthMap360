"""Private publication snapshots, canonical quality flags and alert evidence."""

from datetime import date, timedelta

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = depends_on = None


def upgrade():
    for column in [
        sa.Column("quality_status", sa.String(20), nullable=False, server_default="valid"),
        sa.Column("provenance", sa.String(20), nullable=False, server_default="unverified"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    ]:
        op.add_column("cases", column)
    op.add_column("alert_rules", sa.Column("geographic_scope", sa.String(20), nullable=False, server_default="local"))
    with op.batch_alter_table("alerts") as batch:
        batch.drop_constraint("uq_alert_evaluation", type_="unique")
        batch.add_column(sa.Column("is_historical", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("data_state", sa.String(30), nullable=False, server_default="unknown"))
        batch.add_column(sa.Column("latest_report_date", sa.Date()))
    op.create_table(
        "alert_evaluations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("rule_id", sa.Integer(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("disease", sa.String(length=120), nullable=False),
        sa.Column("as_of", sa.Date(), nullable=False),
        sa.Column("is_historical", sa.Boolean(), nullable=False),
        sa.Column("state", sa.String(length=30), nullable=False),
        sa.Column("value", sa.Integer(), nullable=True),
        sa.Column("threshold", sa.Integer(), nullable=False),
        sa.Column("window_start", sa.Date(), nullable=False),
        sa.Column("latest_report_date", sa.Date(), nullable=True),
        sa.Column("complete", sa.Boolean(), nullable=False),
        sa.Column("periods", sa.JSON(), nullable=False),
        sa.Column("incident_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["incident_id"],
            ["alerts.id"],
        ),
        sa.ForeignKeyConstraint(
            ["location_id"],
            ["locations.id"],
        ),
        sa.ForeignKeyConstraint(
            ["rule_id"],
            ["alert_rules.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rule_id", "location_id", "disease", "as_of", "is_historical", name="uq_signal_day"),
    )
    op.create_table(
        "publications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("outbreak_id", sa.Integer(), nullable=True),
        sa.Column("disease", sa.String(length=120), nullable=False),
        sa.Column("date_from", sa.Date(), nullable=False),
        sa.Column("date_to", sa.Date(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("public_name", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("methodology", sa.Text(), nullable=False),
        sa.Column("source_name", sa.String(length=200), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=False),
        sa.Column("suppression_threshold", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("published_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["location_id"],
            ["locations.id"],
        ),
        sa.ForeignKeyConstraint(
            ["outbreak_id"],
            ["outbreaks.id"],
        ),
        sa.ForeignKeyConstraint(
            ["published_by"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "publication_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("publication_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["publication_id"],
            ["publications.id"],
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "rate_buckets",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "recovery_tokens",
        sa.Column("digest", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("digest"),
    )
    connection = op.get_bind()
    rows = (
        connection.execute(
            sa.text(
                "SELECT id,location_id,disease,date,reporting_period_days,source,feed_id FROM cases ORDER BY location_id,disease,date,id"
            )
        )
        .mappings()
        .all()
    )
    groups = {}
    flagged = set()
    for row in rows:
        end = date.fromisoformat(str(row["date"]))
        start = end - timedelta(days=row["reporting_period_days"] - 1)
        group = groups.setdefault((row["location_id"], row["disease"]), [])
        for other_id, other_start, other_end in group:
            if start <= other_end and other_start <= end:
                flagged.update((row["id"], other_id))
        group[:] = [(i, s, e) for i, s, e in group if e >= start - timedelta(days=7)]
        group.append((row["id"], start, end))
        source = (row["source"] or "").casefold()
        provenance = (
            "demo"
            if any(term in source for term in ("demonstration", "sample data", "synthetic", "demo data"))
            else "source"
            if row["feed_id"]
            else "unverified"
        )
        connection.execute(
            sa.text("UPDATE cases SET provenance=:provenance WHERE id=:id"), {"provenance": provenance, "id": row["id"]}
        )
    for case_id in flagged:
        connection.execute(sa.text("UPDATE cases SET quality_status='review' WHERE id=:id"), {"id": case_id})
    connection.execute(
        sa.text(
            "UPDATE alert_rules SET geographic_scope='national' WHERE location_id IN (SELECT id FROM locations WHERE lower(trim(administrative_level))='country')"
        )
    )
    connection.execute(
        sa.text(
            "UPDATE alert_rules SET geographic_scope='regional' WHERE location_id IN (SELECT id FROM locations WHERE lower(trim(administrative_level)) IN ('state','province','region','territory','administrative'))"
        )
    )
    connection.execute(
        sa.text("UPDATE alerts SET is_historical=:historical WHERE window_end < :today"),
        {"historical": True, "today": date.today()},
    )


def downgrade():
    connection = op.get_bind()
    for table in (
        "cases",
        "alert_evaluations",
        "publications",
        "publication_events",
        "rate_buckets",
        "recovery_tokens",
        "alerts",
    ):
        if connection.scalar(sa.text("SELECT count(*) FROM " + table)):
            raise RuntimeError("Export and review pilot records before downgrading")
    for table in ("publication_events", "publications", "alert_evaluations", "rate_buckets", "recovery_tokens"):
        op.drop_table(table)
    with op.batch_alter_table("alerts") as batch:
        for column in ("is_historical", "data_state", "latest_report_date"):
            batch.drop_column(column)
        batch.create_unique_constraint("uq_alert_evaluation", ["rule_id", "location_id", "disease", "window_end"])
    with op.batch_alter_table("alert_rules") as batch:
        batch.drop_column("geographic_scope")
    with op.batch_alter_table("cases") as batch:
        for column in ("quality_status", "provenance", "version"):
            batch.drop_column(column)
