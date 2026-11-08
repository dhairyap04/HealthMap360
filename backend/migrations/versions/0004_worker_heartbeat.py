"""Expose scheduled worker liveness."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = depends_on = None


def upgrade():
    op.add_column("locations", sa.Column("country_code", sa.String(2), nullable=True))
    op.create_table(
        "worker_heartbeat",
        sa.Column("id", sa.String(30), primary_key=True),
        sa.Column("last_tick_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("worker_heartbeat")
    with op.batch_alter_table("locations") as batch:
        batch.drop_column("country_code")
