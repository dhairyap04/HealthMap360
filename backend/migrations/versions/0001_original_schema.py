"""Original schema baseline; adopts an existing original database without dropping data."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = depends_on = None


def upgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    original = {"locations", "cases", "resources", "users"}
    if original & tables:
        if not original <= tables:
            raise RuntimeError("Partial legacy schema detected. Restore a complete backup before migration.")
        return
    op.create_table(
        "locations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("population", sa.Integer),
        sa.Column("administrative_level", sa.String),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.String, nullable=False, unique=True),
        sa.Column("email", sa.String, nullable=False, unique=True),
        sa.Column("role", sa.String, nullable=False, server_default="public"),
        sa.Column("hashed_password", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "cases",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("location_id", sa.Integer, sa.ForeignKey("locations.id"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("case_count", sa.Integer, nullable=False),
        sa.Column("severity", sa.String, nullable=False),
        sa.Column("source", sa.String),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "resources",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("type", sa.String, nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("location_id", sa.Integer, sa.ForeignKey("locations.id")),
        sa.Column("allocated_date", sa.Date),
    )


def downgrade():
    raise RuntimeError(
        "Baseline downgrade is intentionally disabled to prevent deleting health data. Restore a backup instead."
    )
