# HealthMap360

**Bring public-health reports into focus. Review the evidence. Coordinate follow-up.**

HealthMap360 is a public-health workspace that connects reported disease observations, geographic context, weekly reviews, and response coordination. It helps analysts move from a collection of reports to a clearer understanding of what changed, what is missing, and what needs human follow-up.

The project is designed around **regional public-health analysts**, with an initial focus on respiratory surveillance in Alberta. A separate public experience shows only explicitly approved publication snapshots.

![HealthMap360 overview showing fictional reporting totals, trends, locations, and source context](docs/images/overview.jpg)

*Screenshots use an isolated local database and clearly labelled fictional demonstration data. They do not describe actual disease activity or an operational health-service deployment.*

[Interface tour](#interface-tour) · [Features](#what-you-can-do) · [Run locally](#start-locally-without-docker) · [Deployment](#configuration-and-hosting) · [Checks](#checks)

## Why HealthMap360?

A count alone does not tell the whole story. Analysts also need to know the reporting area, dates, source, cadence, completeness, and whether a value has been revised. A signal then needs an owner, a documented next step, and a clear boundary between internal work and public communication.

HealthMap360 brings those steps into one workspace:

**Collect → Understand → Review → Coordinate → Communicate**

It keeps missing data visible, separates different reporting geographies and measurements, and connects investigations to explicitly selected observations rather than assuming that every nearby report belongs to the same event.

## What you can do

| Capability | How it helps |
| --- | --- |
| **Import and validate reports** | Upload CSVs, map source columns, preview records, and validate the full file before an atomic import. Exact duplicates are skipped; conflicting changes require review. |
| **Explore trends and maps** | Filter by reporting window, disease, assessment, and location. Keep local, regional, and national views separate, with sources and freshness visible. |
| **Review weekly changes** | Compare two seven-day reporting windows with coverage and source checks. Show crude reported-case rates only when the population reference and reporting coverage meet the required conditions. |
| **Add source context** | Connect the WHO weekly country-level COVID-19 feed with scheduled refreshes, or load separate, read-only PHAC provincial laboratory context on demand. |
| **Track investigations** | Assign an owner and response priority, select reporting locations, link observations explicitly, and retain situation updates and lifecycle history. |
| **Review threshold alerts** | Configure scoped rules, inspect supporting evidence, acknowledge incidents, and create a follow-up investigation. Incomplete reports are not treated as proof that an incident has resolved. |
| **Coordinate inventory** | Record resource types, quantities, assigned locations, and allocation dates; edit or remove inventory entries as needed. |
| **Inspect data quality and provenance** | Review reporting coverage, import history, source revisions, observation corrections, and before/after audit evidence. |
| **Control public communication** | Prepare private snapshots for administrator review, publish or withdraw them explicitly, and keep internal notes and exact coordinates out of public responses. |
| **Export and work across devices** | Download filtered observation CSVs and private weekly-review JSON bundles. Use responsive navigation, keyboard controls, and chart data tables. |

## Interface tour

### 1. Understand the reporting picture

The overview brings reported-case totals, disease breakdowns, trends, and location summaries together. Reporting dates, cadence, sources, and missing-data guidance accompany the numbers so retrieval time is not confused with report freshness.

### 2. Explore the geography

Use **Outbreak map** to inspect the areas represented by the selected reports. Local markers show recorded counts and reviewed assessments; regional and national views use area boundaries. Locations without reports remain distinguishable from locations with zero recorded cases.

![HealthMap360 outbreak map showing three fictional Alberta reporting locations, source dates, and an area list](docs/images/outbreak-map.jpg)

### 3. Review a week with its evidence

**Weekly review** compares one disease and reporting area across two seven-day windows. Coverage, cadence, source consistency, and population context determine which comparisons and rates are available. The built-in read-only demo lets users explore complete reporting, incomplete reporting, and an unverified population denominator without creating records.

![The fictional weekly-review walkthrough showing reporting coverage, a week-to-week comparison, and population context](docs/images/weekly-review.jpg)

PHAC laboratory positivity is a separate contextual indicator; tests and detections are never added to reported-case totals.

### 4. Coordinate an investigation

Create a named investigation, review its owner and priority, and explicitly link eligible observations. Its totals and timeline follow those linked records. Situation updates and lifecycle changes keep the follow-up understandable over time.

![A fictional influenza investigation showing its owner, scope, linked observations, situation summary, and activity history](docs/images/investigation.jpg)

### 5. Keep the underlying reports reviewable

**Reports & data** supports CSV import, column mapping, validation, record corrections, provenance history, pagination, and filtered exports. **Data health** and **Data feeds** provide additional views of source coverage and refresh status.

![The observation table showing fictional disease reports with reporting periods, source labels, and investigation associations](docs/images/reports.jpg)

### 6. Use the workspace on a smaller screen

Mobile navigation keeps the core views within reach, with a menu for the full workspace. The same reporting context and interpretation rules remain visible on narrow screens.

<img src="docs/images/mobile-review.jpg" alt="HealthMap360 mobile weekly-review walkthrough, clearly labelled as a fictional read-only demo" width="390" />

## Scope and data interpretation

- A record is a **reported count for one disease, location, and reporting date**, with a daily or weekly reporting period—not a patient record or an active-infection estimate.
- **Missing reports do not mean zero.** Incomplete or incompatible reporting can withhold comparisons; population-based rates require verified denominator context.
- **Analyst assessment, alert priority, and investigation response priority are distinct.** Raw totals do not determine clinical severity or automatically declare an outbreak.
- **Public reports are approved snapshots**, not a live view of the private database. Existing records stay private until an administrator explicitly publishes eligible evidence.
- **This is a personal project and controlled-pilot prototype.** No institutional adoption, clinical validation, user-acceptance results, or public production deployment is claimed. An automatic Alberta incident-case connector and external email/SMS delivery are not implemented.

The [workflow and data guide](docs/WORKFLOW_GUIDE.md) documents roles, import rules, source behavior, alerts, investigations, publication boundaries, and the fictional demo in detail.

## Built with

| Layer | Technologies |
| --- | --- |
| Interface | React, TypeScript, Vite, Recharts, Leaflet / React Leaflet, Radix UI |
| API and validation | Python, FastAPI, Pydantic |
| Persistence | SQLAlchemy, Alembic, SQLite for native development, PostgreSQL / PostGIS in Compose |
| Access and operations | Role-based access, session invalidation, production administrator MFA, background feed/alert worker |
| Delivery and verification | Docker Compose, Nginx, GitHub Actions, pytest, Ruff, Vitest, Playwright, axe checks |

## Further documentation

- [Product direction and planned user validation](docs/PRODUCT_DIRECTION.md)
- [Workflow and data guide](docs/WORKFLOW_GUIDE.md)
- [Pilot operations and release gates](docs/PILOT_RUNBOOK.md)
- [Regional data-source assessment](docs/REGIONAL_SOURCES.md)
- [Validation record](docs/PILOT_VALIDATION.md)
- [UI, usability, and accessibility review](docs/UI_UX_AUDIT.md)

---

The sections below cover local development, database migrations, deployment, and verification.

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
# APP_DATABASE_PASSWORD=<different strong application password>
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
