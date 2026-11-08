"""Administrator MFA and portable timestamp defaults."""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = depends_on = None


def upgrade():
    op.add_column("users", sa.Column("mfa_secret", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("mfa_pending", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("mfa_last_step", sa.Integer(), nullable=False, server_default="-1"))
    # Also upgrades development databases that applied the initial 0006 draft.
    for table in ("publications", "publication_events", "alert_evaluations"):
        with op.batch_alter_table(table) as batch:
            batch.alter_column(
                "created_at",
                existing_type=sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                existing_nullable=False,
            )


def downgrade():
    with op.batch_alter_table("users") as batch:
        batch.drop_column("mfa_last_step")
        batch.drop_column("mfa_pending")
        batch.drop_column("mfa_secret")
