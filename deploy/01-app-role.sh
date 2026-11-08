#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password APP_DATABASE_PASSWORD
CREATE ROLE healthmap_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE healthmap360 TO healthmap_app;
GRANT USAGE, CREATE ON SCHEMA public TO healthmap_app;
SQL
