# HealthMap360

A working public health workspace for importing reported disease observations, viewing outbreak trends and maps, and coordinating resource inventories.

## What works

- Registration, sign-in, session restoration, logout, password changes, and administrator-managed roles.
- Full-file CSV parsing, column mapping, validation, atomic database import, duplicate detection, and import history.
- Filtered dashboard metrics, reporting trends, disease breakdowns, and geographic outbreak markers.
- Paginated observations with corrections, deletion, and filtered CSV export.
- Location search by city, region or address, with region/country context and map confirmation; resource inventory creation, allocation, editing, and deletion.
- Versioned database migrations for SQLite development and PostgreSQL/PostGIS deployments.
- API, validation, migration, and real-browser workflow tests, plus CI.

## Start locally without Docker

Requires Python 3.12+ and Node 22.12+. Run these commands from the repository root. Explicitly setting `DATABASE_URL` overrides any existing root `.env` configuration.

```bash
python3.12 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
export DATABASE_URL="sqlite:///$(pwd)/backend/healthmap360.db"
backend/.venv/bin/alembic -c backend/alembic.ini upgrade head
PYTHONPATH=backend backend/.venv/bin/python -m app.manage create-admin --username admin --email admin@example.com
```

The admin command securely prompts for a password (10+ characters) and confirmation. It can also promote an existing account with a matching username/email and reset its password. There are no default application credentials.

Start the backend in this terminal:

```bash
PYTHONPATH=backend backend/.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open [the workspace](http://localhost:5173). Sign in with your administrator account, open **Reports & data**, download the sample CSV, and import it. The sample is fictional demonstration data; it is never loaded automatically. Dashboard, map, reports, and resources read persisted API data.

API documentation: [Swagger UI](http://127.0.0.1:8000/docs). Readiness: [health check](http://127.0.0.1:8000/health).

## Start with Docker

```bash
docker compose up --build
```

Database readiness is checked before backend migration/startup, and backend readiness is checked before frontend startup. Create your administrator in another terminal:

```bash
docker compose exec backend python -m app.manage create-admin --username admin --email admin@example.com
```

Open [the workspace](http://localhost:5173). PostgreSQL data persists in the `db_data` volume. `docker compose down` retains it. Do not delete the volume unless you intend to discard the database.

Compose uses PostGIS, but current mapping uses stored latitude/longitude; spatial SQL extensions are not required. Unused Redis has been removed. Local service ports are bound to loopback.

## Roles and sessions

| Role | Access |
| --- | --- |
| Public | View dashboard, map, locations, resources and observations; export reports |
| Analyst | Public access plus import/correct/delete observations, manage locations/resources, view import history |
| Administrator | Analyst access plus account role management |

New registrations always receive public access. Administrators grant roles in Settings. Password changes, role changes, and logout invalidate existing tokens for the affected account. Tokens live in the browser tab's session storage and expire after 12 hours. Development uses a process-local signing secret when none is configured, so restarting the API requires signing in again. Configure a persistent random secret for multiworker or deployed services.

## Data contract and import behavior

A record is a **reported count for one disease at one location and reporting date**, with a daily (1 day) or weekly (7 days) reporting period. It is not a patient record, cumulative case count, active infection estimate, or medical recommendation. The unique observation key is `(location, date, disease)`. Investigations are modeled separately and explicitly link eligible observations; assigning a location to an investigation does not automatically claim all of its cases.

Required CSV columns:

| Field | Rule |
| --- | --- |
| `date` | Real calendar date, exactly `YYYY-MM-DD` |
| `location` | Nonempty location name, up to 200 characters |
| `disease` | Nonempty disease name, up to 120 characters; whitespace normalized and lowercased |
| `case_count` | Whole number from 0 through 2,147,483,647 |
| `severity` | `low`, `medium`, `high` or `critical`, case-insensitive |

Optional columns: `reporting_period_days` (`1` for daily, `7` for weekly; defaults to `1`), `source` (up to 300 characters), `latitude` (-90 to 90), and `longitude` (-180 to 180). Existing locations match names with case/whitespace normalization. New locations require both coordinates; known locations can omit them. Supplied coordinates must agree with the saved location. Use distinct names for places with the same name in different jurisdictions (for example `Springfield, Illinois`). CSV import does not geocode automatically. In Settings, use **Add location** to search for a place, select the correct region/country, and confirm it on the map. Coordinates are saved automatically, so subsequent CSV files can refer to the saved display name without coordinates.

The column mapper supports different source headers. Files must be UTF-8, at most 50 MB and 10,000 rows. Larger datasets must be split into files. Every row is validated on the server before writes. Invalid rows, conflicting records, or concurrent uniqueness conflicts abort the entire transaction; up to 50 row errors are returned. The UI displays 50 preview rows but validates the full file.

Repeated keys with identical count, severity and source are skipped. Changed values on an existing key are rejected; use **Edit** to make an explicit correction. Import history records successful batches, including batches consisting only of duplicates. It is not a complete edit/delete audit log.

Dashboard filters apply to observations and map markers. Resource units reflect current inventory, restricted by the location filter only; disease, date and severity filters do not change inventory. The map shows all saved locations, including newly added places with no observations. Those places use neutral dashed markers and have no inferred case count or severity. Observation filters change the report overlay while the location filter restricts which saved places appear. The map's severity is the highest reported severity in the selected observations. Missing reporting days are not treated as zero. Exports include all matched observations, beyond the displayed page, and neutralize spreadsheet formula prefixes in text fields.

## Place search

Settings → Add location searches cities, regions and addresses by name. Search runs only when the user clicks **Search** or presses Enter, and results include region/country details to distinguish similarly named places. Selecting a result fills its map position automatically; a preview map lets users confirm the choice before saving. Existing locations can be renamed or have their optional details updated without searching again. The normal form never requires manual latitude/longitude entry.

Search uses OpenStreetMap's Nominatim service, requires internet access, and handles empty results or unavailable service with retry guidance. Results are cached for 24 hours (up to 256 queries per API process), outbound searches are serialized and limited to one per 1.1 seconds, and provider attribution is displayed. It does not perform autocomplete or bulk geocoding. The included API runs as a single worker. For multiple workers/replicas, use a shared rate-limited Nominatim-compatible endpoint or a self-hosted provider rather than multiplying calls to the public service. Set `GEOCODING_URL` to that endpoint's search URL and `GEOCODING_USER_AGENT` to your application's identifying user agent. See the [provider's usage policy](https://operations.osmfoundation.org/policies/nominatim/).

Filter menus share the workspace's colors, selection indicators and focus styling. They support arrow keys, type-to-select, Enter, Escape, and touch input.

## Database migrations

```bash
backend/.venv/bin/alembic -c backend/alembic.ini upgrade head
```

Use the same `DATABASE_URL` for migration, administration and API startup. Back up an existing database before migration. The baseline recognizes the original four-table schema and adopts it without dropping records. The next migration adds normalized location names, disease identifiers, constraints, token revocation, and import history. Legacy observations receive disease `unspecified`; correct them using Reports once their disease is known. An existing legacy PostGIS `geom` column is preserved but unused by the application.

Migrations stop on ambiguous duplicate names/observations, colliding normalized accounts, or invalid legacy values; reconcile those records and retry. Downgrades intentionally refuse to delete health data. Restore a backup to roll back. Future schema changes belong in new Alembic revisions; application startup does not silently call `create_all`.

## Configuration and hosting

Root `.env.example` and `frontend/.env.example` document the available settings. Local `.env` files are ignored by Git. The previously tracked root `.env` is removed from tracking while retained locally; any credentials already present in Git history should be replaced before sharing the repository.

Production requires `ENVIRONMENT=production` and a random `SECRET_KEY` of at least 32 characters. Generate one with:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
```

`CORS_ORIGINS` is a JSON array of allowed frontend origins. Never place API secrets in `VITE_*` variables: those values become public frontend assets.

The frontend defaults to `/api`. Vite proxies that prefix to the backend during development. `API_PROXY_TARGET` changes the development target, including inside Compose. For production, serve the built frontend behind a reverse proxy that forwards `/api/*` to the backend with `/api` stripped, or set `VITE_API_URL=https://your-api-host` at frontend build time and allow the frontend origin through CORS.

The included production Compose file builds static frontend assets and serves them through Nginx with the API proxy:

```bash
# Set these in your environment or local root .env first:
# ENVIRONMENT=production, SECRET_KEY=<random secret>, POSTGRES_PASSWORD=<strong password>
docker compose -f docker-compose.production.yml up --build -d
docker compose -f docker-compose.production.yml exec backend python -m app.manage create-admin --username admin --email admin@example.com
```

It binds the workspace to `127.0.0.1:8080`; add HTTPS at your hosting ingress before exposing it publicly. Hash routing supports refresh/deep links on static hosting. GitHub Pages deployment is opt-in: set repository Actions variable `HEALTHMAP_API_URL` to an externally hosted HTTPS backend URL. Pages hosts only the frontend; configure that backend's CORS origins. No external deployment is performed by local setup.

## Checks

```bash
cd backend
.venv/bin/pytest -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
cd ../frontend
npm run build
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:e2e
```

Browser tests launch disposable API/database and frontend processes on ports 8001 and 5174. They exercise sign-in, full CSV import, persistence after reload, dashboard filters, map markers, export, resources, locations, record correction/deletion, responsive layout, and public-role restrictions. They do not use your configured application database. External map tiles are deliberately excluded from the test.

To run API tests on an isolated PostgreSQL schema:

```bash
cd backend
TEST_DATABASE_URL=postgresql+psycopg://user:password@localhost/test_database .venv/bin/pytest -q
```

Use a dedicated test database whose account can create/drop schemas. Each API test creates and drops its own randomly named schema. SQLite remains the default for tests. CI runs both database paths, browser tests, and a production container build/readiness check.

Runtime Python dependencies are hash-locked in `backend/requirements.txt`; update their ranges in `requirements.in` and regenerate with `pip-compile --generate-hashes --strip-extras requirements.in`. Development dependencies are separately hash-locked from `requirements-dev.in`; regenerate them with `pip-compile --generate-hashes --strip-extras requirements-dev.in`. Frontend dependencies are locked by `package-lock.json` and installed with `npm ci`.

## Investigations, alerts and live feeds

**Investigations:** Open Investigations to create a named outbreak record with a disease, tracked locations, reporting dates, priority and owner. Its lifecycle is investigating → active → contained → closed, with explicit reopening supported. Closed investigations require an end date. Available observations must match the investigation's disease, locations and reporting dates; a record can belong to only one investigation. Linking/unlinking is explicit and atomic. Incompatible scope edits are rejected until affected observations are unlinked. Closing retains history and prevents link changes until reopening. Situation updates, ownership, lifecycle changes and link operations remain in the activity timeline. Case totals and charts include only linked observations.

**Alerts:** Create a rule with a case threshold, a 1–90 day reporting-date window, optional disease/location scope and review priority. Each disease/location is evaluated separately. Case writes, CSV imports and feed syncs evaluate rules in the same transaction; the background worker evaluates them every minute. An evaluation date can be chosen for historical review. Alerts are deduplicated per rule, disease, location and evaluation date. Acknowledgment is shared across the response team; manual resolution suppresses the same rule/group/day until the next reporting-day evaluation. Rule edits re-evaluate the current day's event, and paused rules resolve their outstanding events. Previously raised alerts remain reviewable; in-app notifications are not email/SMS delivery or a medical classification.

**Live source:** Data feeds provides the WHO weekly country-level COVID-19 CSV connector. Connect a WHO country code to a matching saved country; cities are rejected and country identity is checked using the search result's country code (or an exact source-country name for legacy records). Choose an import start date, refresh interval and review severity. The source does not provide the application's severity label, so this is explicitly analyst selected. Countries report with varying delays; the UI shows latest source dates, stale reporting, missing intervals and failures. Blank counts remain missing. Negative retrospective adjustments abort the entire selected interval for source review, rather than fabricating nonnegative observations.

The adapter uses the official [WHO weekly download](https://srhdpeuwpubsa.blob.core.windows.net/whdh/COVID/WHO-COVID-19-global-data.csv) and [source methodology](https://data.who.int/dashboards/covid19/data). It never fetches a caller-supplied URL. Downloads have size/time limits and a 15-minute process cache. Repeated syncs skip identical records; changed counts owned by the same feed are revised with before/after history. Syncs cannot overwrite analyst-owned records or mix overlapping daily/weekly national reports. An explicit correction through Reports transfers ownership to the analyst; a subsequent conflicting sync requires review. Pausing retains existing observations.

**Background processing:** Docker Compose starts the worker after database migrations and API readiness. For native development, run a third terminal using the same database and signing-key environment as the API:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m app.worker
# One pass, suitable for an external scheduler:
PYTHONPATH=backend backend/.venv/bin/python -m app.worker --once
```

Due jobs are claimed with durable five-minute leases. Interrupted runs are recorded when a lease is recovered; source failures are logged and retried on a bounded schedule. `/feeds/worker-status` and `python -m app.worker --health` expose worker liveness. Data feeds shows when scheduled refreshes are offline while retaining manual Sync now. Run history distinguishes imports, revisions, unchanged records and failures. The worker never sends messages outside the application.

**Observation provenance:** Reports displays daily/weekly periods, investigation links, sources and a History action. New imports, analyst corrections, feed revisions and link changes are audited with before/after values. Old observations retain their original values and default daily period. These migrations preserve the original records; back up existing deployments before upgrading to the new schema.

## Remaining product decisions

The implemented next iteration covers a WHO live connector, scheduled syncs, in-app threshold alerts and investigation tracking. Further product work can add additional local and national adapters, pathogen-specific outbreak attribution, population-based incidence, resource transfer histories, account recovery/email verification, centralized authentication, external notification delivery, and deployment monitoring. Weekly report totals must not be interpreted as daily incidence or active infection estimates.
