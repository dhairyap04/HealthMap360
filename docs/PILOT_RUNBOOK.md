# HealthMap360 pilot operation and release gates

## Access and publication

Anonymous visitors and registered public users can read `/public/reports` and
`/public/reports/{id}` only, plus health and authentication endpoints. Public
responses are explicit reviewed snapshots, with no internal notes, assessments,
owner identities, audit history, exact coordinates or private source strings.
Public accounts can manage their own authentication; they cannot read analyst
APIs or publish. Analysts can manage private observations, feeds, alerts,
investigations, inventory and publication drafts. Administrators additionally
manage roles and publish/withdraw reviewed snapshots.

All migrated data stays private. A draft copies reporting-date evidence and
requires public title, reporting-area name, summary, source and methodology.
Publication requires an explicit administrator privacy/source review. Counts
below five (or a higher configured threshold) and totals that reveal those counts
are withheld. This is a baseline safeguard, not a complete disclosure-control
certification: overlapping snapshots, external datasets, small-area names and
repeated publications need human review. Do not publish patient-level data.

Snapshots do not update automatically with private source corrections. A changed
draft must be recreated and reviewed. Publishing a replacement withdraws the
previous matching area/disease/investigation snapshot. Public GETs are no-store;
withdrawal returns 404 but cannot recall copies previously downloaded.

## Canonical reporting policy

Every API/import/feed writer locks reporting areas in consistent order before
checking intervals. A weekly report covers its ending date and previous six days.
Overlapping reports of the same disease/area are rejected; adjacent intervals are
allowed. Competing sources must be reviewed explicitly. The canonical table does
not support unreviewed parallel-source addition or percentage/wastewater metrics.
The migration flags existing ambiguous intervals for review, preserves all raw
observations and excludes flagged records from totals/publication. Correct or
remove conflicts explicitly; correction validates the remaining intervals.

Investigation totals are separated by reporting area. A combined total/trend is
withheld for multiple areas, including same-level areas whose overlap is unknown.
No links are deleted by migration. Reporting geometry/identifiers cannot move
under existing observations. Create a new area and review assignments instead.

Alerts use one continuing current incident per rule/area/disease, serialized by
rule locks, with separately upserted daily evidence. Acknowledgement persists
across days. Missing/incomplete/conflicting data is explicit; missing/conflicting windows expose no usable current count, even while historical breach evidence is retained. It does not resolve
an incident. Automatic resolution requires a fully covered below-threshold window.
Windows shorter than the source reporting period are incompatible. Historical
exercises are separately labeled and excluded from current monitoring counts.
Manual resolution suppresses repeat signals until a later report is available.
Alert follow-up creates a linked investigation without automatically claiming cases.

## Authentication and verified recovery

Production automatically requires administrator MFA enrollment before privileged
API access. Add the displayed secret to a TOTP authenticator (SHA-1, 6 digits,
30 seconds), confirm a code, then sign in again using the next code. Secrets are
stored with authenticated encryption derived from SECRET_KEY. Keep the database
and signing key backed up securely together. Changing that key invalidates sessions
and makes old MFA secrets unreadable; plan controlled reenrollment/key rotation.

Login and enrollment attempts use database-backed bounded buckets, plus proxy
IP limits. Ordinary registered accounts start with public-only access. No email
verification is claimed: operator identity verification is required before granting
analyst/administrator roles. No email/SMS delivery is configured or sent.

After independent identity verification, a trusted operator may run with the exact
intended DATABASE_URL and signing configuration:

```sh
PYTHONPATH=backend backend/.venv/bin/python -m app.account_admin issue-recovery --username NAME --identity-verified
```

Deliver the printed one-use token through the operator's verified private channel.
It expires in 30 minutes and is stored only as a digest. The user redeems it through
Recover account. All sessions are revoked; existing MFA remains required.
For a separately verified lost authenticator, use the `reset-mfa` command, confirm
the account interactively, and record the operator action in your restricted
operational audit. Production administrator privilege stays locked until reenrollment.
Never put recovery tokens in URLs, logs, tickets or Git. No self-service email
recovery is claimed by this pilot.

## Deployment

Native development uses the persistent signing key, explicit SQLite DATABASE_URL,
API on 8000, frontend on 5175 and `python -m app.worker` with the same database.
Run migrations before API/worker startup. Frontend commands run in `frontend/`.
Never replace another project's service on port 5173.

For a fresh disposable/production Compose deployment set distinct random
POSTGRES_PASSWORD, APP_DATABASE_PASSWORD and SECRET_KEY (32+ characters). The
bootstrap postgres account creates `healthmap_app`, a non-superuser without role
or database creation privileges. API/worker use only this application role.

```sh
docker compose --env-file /secure/healthmap.env -f docker-compose.production.yml up --build -d --wait
```

Existing volumes are not bootstrapped again. Before upgrading an existing
postgres-owned installation, take a verified backup and have the database operator
create the application role and transfer ownership of **application tables and
sequences only**, including alembic_version, to it. Do not blindly reassign system
objects. Verify migrations and restore on a disposable copy before cutover.

Port 8080 binds to loopback. Before public access, configure a supported TLS
reverse proxy with trusted host/origin settings and the real domain. Do not expose
the database or publish the local preview. Map tiles/geocoding need a provider and
traffic plan consistent with provider terms. Generalized Natural Earth outlines
are not authoritative health-region catchments.

## Backups, restores and monitoring

Run backups using a restricted directory and scheduled operator job:

```sh
PYTHONPATH=backend backend/.venv/bin/python -m app.operations backup --file /secure/backups/healthmap-YYYYMMDD.backup
```

SQLite uses its online backup API; PostgreSQL dumps the managed public-schema application tables plus alembic_version in pg_dump custom format. Unused PostGIS extension objects and unrelated tables are deliberately excluded, so restores do not require extension/superuser privileges. This is an application backup, not a full cluster/custom-schema backup. It uses
credentials passed through the process environment, not arguments. Backup files
are created mode 0600 and accompanied by a SHA-256 checksum. For PostgreSQL install
matching PostgreSQL client tools. Production encryption-at-rest and off-host backup
storage, retention and key custody must be configured by the hosting operator.

Test restore with DATABASE_URL pointing to a new **empty disposable database**:

```sh
PYTHONPATH=backend backend/.venv/bin/python -m app.operations restore --file /secure/backups/healthmap-YYYYMMDD.backup
```

Restore refuses a nonempty target, checks the checksum and SQLite integrity/FKs.
Compare observations, totals, ownership, links, publications and audit counts after
restore and run readiness checks before approving recovery. Never run restore tests
against the live preview or production database. Define recovery point/time targets
with pilot users and schedule a restore drill, not merely a backup job.

Monitor `/health`, worker `--health`, and `python -m app.operations monitor`.
The latter exits nonzero for a stale worker or failed enabled feeds. Wire nonzero
results into the operator's actual monitoring/on-call system; this repository does
not claim to have provisioned external monitoring or sent notifications. Data health
separates latest source report from successful sync and identifies demo/conflict data.
Request metadata logs use request IDs, paths/status/durations, never request bodies,
credentials or query tokens. Configure the `healthmap.requests` logger at INFO in
your hosting log configuration to collect successful requests; errors log at ERROR.

## Readiness gates

Controlled aggregate-data pilot: require passing database/browser/security tests,
verified source definitions, operator access review, an actual restore drill, an
assigned monitoring operator and explicit participant expectations.

Public release still requires domain/TLS and hosting configuration, monitored
backups, an operational incident process, independent security/privacy and
accessibility review, representative load tests and real user acceptance. Public
source approval is a deliberate action. Regional integration remains subject to
REGIONAL_SOURCES.md. Population rates, typed laboratory/wastewater metrics, personal
subscriptions and external notifications are future work rather than simulated
features. No clinical validation or regulatory compliance is claimed.

An operator-installable daily backup script and crontab example are in
`deploy/scheduled-backup.sh` and `deploy/backup.cron.example`. They are not installed
on the user's computer. Configure restricted environment storage, off-host copying,
retention and failure monitoring on the actual hosting system before public use.
