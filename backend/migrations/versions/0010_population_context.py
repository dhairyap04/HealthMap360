"""Dated, sourced population denominators; existing estimates remain unconfirmed."""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = depends_on = None


def sequence_value():
    connection = op.get_bind()
    if connection.dialect.name != "sqlite":
        return None
    return max(
        connection.scalar(sa.text("SELECT seq FROM sqlite_sequence WHERE name = 'locations'")) or 0,
        connection.scalar(sa.text("SELECT max(location_id) FROM location_events")) or 0,
    )


def preserve_sequence(value):
    if value is not None:
        op.get_bind().execute(
            sa.text("UPDATE sqlite_sequence SET seq = max(seq, :value) WHERE name = 'locations'"), {"value": value}
        )


def upgrade():
    sequence = sequence_value()
    with op.batch_alter_table("locations", table_kwargs={"sqlite_autoincrement": True}) as batch:
        batch.add_column(sa.Column("population_year", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("population_source", sa.String(500), nullable=True))
        batch.add_column(
            sa.Column("population_area_confirmed", sa.Boolean(), nullable=False, server_default=sa.false())
        )

    preserve_sequence(sequence)


def downgrade():
    connection = op.get_bind()
    if connection.scalar(
        sa.text(
            "SELECT count(*) FROM locations WHERE population_year IS NOT NULL OR population_source IS NOT NULL OR population_area_confirmed = true"
        )
    ):
        raise RuntimeError("Export/review population denominator metadata before downgrading")
    sequence = sequence_value()
    with op.batch_alter_table("locations", table_kwargs={"sqlite_autoincrement": True}) as batch:
        batch.drop_column("population_area_confirmed")
        batch.drop_column("population_source")
        batch.drop_column("population_year")

    preserve_sequence(sequence)
