"""Archive reporting areas and retain explicit lifecycle audit tombstones."""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = depends_on = None


def upgrade():
    sqlite = op.get_bind().dialect.name == "sqlite"
    with op.batch_alter_table(
        "locations", recreate="always" if sqlite else "auto", table_kwargs={"sqlite_autoincrement": True}
    ) as batch:
        batch.add_column(sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
        batch.create_index("ix_locations_archived_at", ["archived_at"])
    op.create_table(
        "location_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_location_events_location_id", "location_events", ["location_id"])


def downgrade():
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT count(*) FROM location_events")) or connection.scalar(
        sa.text("SELECT count(*) FROM locations WHERE archived_at IS NOT NULL")
    ):
        raise RuntimeError("Review/export location lifecycle history before downgrading")
    op.drop_table("location_events")
    with op.batch_alter_table("locations") as batch:
        batch.drop_index("ix_locations_archived_at")
        batch.drop_column("archived_at")
