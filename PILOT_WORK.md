# Pilot implementation work

Baseline: 2c22fe4, clean main. User requested implementation of the attached pilot/public-readiness instructions. No public deployment or external messages authorized.

Plan and acceptance:
1. Private analyst API and explicit, revocable public publication snapshots. Existing data stays private; public responses expose no internal notes, identities, audits or exact coordinates. Anonymous public reading and role-aware frontend.
2. Common transaction locking and interval-overlap validation on all observation writers. Existing ambiguous overlaps preserved but excluded from additive/public totals until reviewed. Investigation totals separated by location and scope; never sum potentially overlapping areas. Lock location metadata used by reports.
3. Alert incident/evaluation separation, one ongoing incident per rule/location/disease; historical evaluation isolated, missing coverage unknown, fresh below-threshold data required for auto-resolution; scoped rules and idempotent concurrency.
4. Assess official regional exports and reuse terms; implement one verified supported source or document limitations and improve CSV provenance.
5. Public location pages/public investigation summaries, publication review, data health, meaningful resource totals, analyst alert-to-investigation connection.
6. Abuse controls, recovery/admin authentication appropriate to local pilot, production secrets/database/HTTPS/backup/monitoring runbooks and scripts, operational verification.
7. SQLite and PostgreSQL migration/regression tests, frontend/unit/browser checks, production validation, preserved-user-data comparison, live demo, milestone commits and pushes.

Baseline saved privately to /tmp/healthmap-pilot-baseline.json. SQLite backup: backend/preview-before-pilot.db (ignored). Native frontend 5175/API 8000/worker verified running. Port 5173 is unrelated.

Optional features (external notification delivery, predictive scores, complex logistics, broad multi-tenancy) are outside this focused pilot. External services must not be simulated as completed.

Implementation checkpoint:
- Migrations 0006–0008 applied locally with counts/ownership preserved and zero public records.
- Private analyst routers, reviewed/withdrawable public snapshots, suppression and public location pages implemented.
- Shared locked interval validation, preserved legacy conflict flags, per-area investigation subtotals, source/demo provenance and CSV metric guard implemented.
- Current alert incidents/evidence, historical separation, coverage-aware resolution and idempotent follow-up investigations implemented.
- MFA enrollment/encrypted secrets, production admin gate, bounded attempts and operator-assisted single-use recovery implemented. No email delivery/verification claimed.
- Restricted production DB role, backup/restore/monitor CLI, request metadata/no-store responses, data health UI, source assessment and operator runbooks implemented.
- Verified: 101 SQLite tests, 100 PostgreSQL + one SQLite-only restore test skipped (actual PG backup/restore drill passed); 6 browser workflows; build/lint/format/15 frontend unit tests; production Compose health and non-superuser role.
- Added a 5,000-row bounded-query test (focused tests pass); final full suites and container rebuild/CI pending.
- User data has not been published yet; final local demo may prepare an explicitly reviewed historical WHO snapshot on loopback only. Demo observations must remain blocked.

Final verification: 104 SQLite / 103 PostgreSQL tests passed (one SQLite-only restore test skipped on PG); actual PostgreSQL and restricted-role production PostGIS-source application-only restore drills passed. Six browser workflows, production build/lint/format, 15 unit tests and container readiness passed. A 5,000-row query/pagination check and concurrent interval writers were exercised. Operator backup script tested without installing a recurring job. Public maps/timelines and server-authoritative date inputs added. CI's first run found a short-desktop navigation overflow; fixed with an explicit viewport regression. Local anonymous WHO snapshot demo prepared and visually checked; existing cases/ownership/links/audits unchanged. Final CI rerun pending the verification commit. Remaining external/operator gates are explicit in docs/PILOT_RUNBOOK.md and docs/REGIONAL_SOURCES.md.

Final QA follow-up: 105 SQLite and 104 PostgreSQL tests passed (one SQLite-only skip on PostgreSQL). CI for 9ef8977 passed all three jobs. A missing current alert window now exposes observed_value=null and renders Unavailable; last-breach evidence remains internal for history. All temporary Docker/restore services were removed; Docker Desktop restored to stopped state. Native preview/API/worker remain running. Final alert fix pushed as a separate verified commit.
