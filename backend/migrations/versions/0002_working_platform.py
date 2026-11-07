"""Disease observations, normalized locations, validation constraints and import audit history."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = depends_on = None


def upgrade():
    connection = op.get_bind()
    locations = connection.execute(sa.text("SELECT id, name FROM locations")).all()
    keys = [" ".join(name.split()).casefold() for _, name in locations]
    if len(set(keys)) != len(keys):
        raise RuntimeError("Legacy locations have duplicate normalized names. Merge them before retrying migration.")
    duplicates = connection.execute(
        sa.text("SELECT location_id, date FROM cases GROUP BY location_id, date HAVING count(*) > 1")
    ).first()
    if duplicates:
        raise RuntimeError(
            "Legacy observations have duplicate location/date records. Reconcile these before migration."
        )
    users = connection.execute(sa.text("SELECT id, username, email FROM users")).all()
    usernames = [name.strip().lower() for _, name, _ in users]
    emails = [email.lower() for _, _, email in users]
    if len(set(usernames)) != len(usernames) or len(set(emails)) != len(emails):
        raise RuntimeError("Legacy usernames/emails collide after normalization. Resolve duplicates before migration.")
    invalid = connection.execute(
        sa.text("""
        SELECT 'location' FROM locations WHERE trim(name) = '' OR latitude NOT BETWEEN -90 AND 90
            OR longitude NOT BETWEEN -180 AND 180 OR population < 0
        UNION ALL SELECT 'case' FROM cases WHERE case_count < 0 OR severity NOT IN ('low','medium','high','critical')
        UNION ALL SELECT 'resource' FROM resources WHERE quantity < 0
        UNION ALL SELECT 'user' FROM users WHERE role NOT IN ('public','analyst','admin')
    """)
    ).first()
    if invalid:
        raise RuntimeError(f"Invalid legacy {invalid[0]} data. Correct it before migration; no records were changed.")
    for user_id, name, email in users:
        connection.execute(
            sa.text("UPDATE users SET username=:name, email=:email WHERE id=:id"),
            {"name": name.strip().lower(), "email": email.lower(), "id": user_id},
        )
    op.add_column("locations", sa.Column("name_key", sa.String(200), nullable=True))
    for (location_id, _), key in zip(locations, keys, strict=True):
        connection.execute(sa.text("UPDATE locations SET name_key=:key WHERE id=:id"), {"key": key, "id": location_id})
    with op.batch_alter_table("locations") as batch:
        batch.alter_column("name_key", existing_type=sa.String(200), nullable=False)
        batch.create_unique_constraint("uq_location_name_key", ["name_key"])
        batch.create_check_constraint("latitude_range", "latitude >= -90 AND latitude <= 90")
        batch.create_check_constraint("longitude_range", "longitude >= -180 AND longitude <= 180")
        batch.create_check_constraint("population_nonnegative", "population IS NULL OR population >= 0")
    indexes = {index["name"] for index in sa.inspect(connection).get_indexes("cases")}
    with op.batch_alter_table("cases") as batch:
        batch.add_column(sa.Column("disease", sa.String(120), nullable=False, server_default="unspecified"))
        batch.create_unique_constraint("uq_case_observation", ["location_id", "date", "disease"])
        batch.create_check_constraint("case_count_nonnegative", "case_count >= 0")
        batch.create_check_constraint("case_severity", "severity IN ('low', 'medium', 'high', 'critical')")
        if "ix_cases_date" not in indexes:
            batch.create_index("ix_cases_date", ["date"])
        if "ix_cases_disease" not in indexes:
            batch.create_index("ix_cases_disease", ["disease"])
        if "ix_cases_location_id" not in indexes:
            batch.create_index("ix_cases_location_id", ["location_id"])
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("token_version", sa.Integer, nullable=False, server_default="0"))
        batch.create_check_constraint("user_role", "role IN ('public', 'analyst', 'admin')")
    with op.batch_alter_table("resources") as batch:
        batch.create_check_constraint("resource_nonnegative", "quantity >= 0")
    op.create_table(
        "imports",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("imported", sa.Integer, nullable=False),
        sa.Column("skipped", sa.Integer, nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade():
    raise RuntimeError("Restore a database backup to roll back this data-preserving migration.")
