"""Link alert incidents to explicit analyst investigations."""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = depends_on = None


def upgrade():
    with op.batch_alter_table("alerts") as batch:
        batch.add_column(sa.Column("outbreak_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_alert_investigation", "outbreaks", ["outbreak_id"], ["id"])


def downgrade():
    with op.batch_alter_table("alerts") as batch:
        batch.drop_constraint("fk_alert_investigation", type_="foreignkey")
        batch.drop_column("outbreak_id")
