# Validation record

Implementation started from 2c22fe4 with a clean working tree. Local preview backed
up to ignored backend/preview-before-pilot.db before migrations. Baseline:
156 observations / 3,190,006 reported cases / 148 feed-owned observations /
0 investigation links / 296 case audit entries. No publications existed.

The source assessment and operational limitations are documented separately.
Tests use disposable databases; browser data is explicitly synthetic.

Validation completion results are recorded in the final implementation handoff.

## Final local checks

- SQLite: 105 backend tests passed.
- PostgreSQL: 104 passed; the SQLite-only restore test was skipped. Actual
  PostgreSQL custom-format backup/restore was separately executed and every
  managed table count and the case total matched.
- A production PostGIS-source/application-role drill restored the managed
  application tables to an empty database without extension/superuser privileges.
- Frontend: production build, ESLint, Prettier and 15 unit tests passed.
- Six Playwright workflows passed, including publication approval/withdrawal,
  anonymous access, public country outline/timeline, mobile layout, and a short
  desktop viewport regression for navigation/Sign out accessibility.
- Concurrency regression: overlapping writers cannot both commit on either DB.
- A 5,000-observation series retained bounded summary queries and pagination.
- Fresh production Compose services passed readiness. healthmap_app was verified
  NOSUPERUSER/NOCREATEDB/NOCREATEROLE. No internet-facing deployment was performed.
- The operator-installable backup script passed shell syntax and an actual
  disposable SQLite backup smoke check; archive permissions were 0600.

Final live preview comparison: all original observation values unchanged,
156 observations, 3,190,006 total, 148 feed-owned, zero investigation links and
296 case audit entries. Foreign-key check returned no violations. Additional
saved locations created during the work were retained (11 total at final check).
A single historical WHO Canada snapshot was deliberately reviewed and published
for the loopback-only demo. The eight demonstration observations remain private
and blocked from publication. No accounts/passwords/MFA settings were changed
for the demo; authenticator and recovery checks used disposable accounts.

CI on the first implementation commit exposed an off-screen Sign out control on
shorter Linux desktop layouts. Navigation now scrolls independently and the
browser workflow asserts Sign out is inside the viewport at 1280×600.
Workspace date controls also use the server's reporting day to avoid browser UTC
midnight differences. CI on 9ef8977 passed the API, frontend and container jobs. A final alert regression ensures a missing current window displays Unavailable rather than a last-breach count; its final CI status is provided in the implementation handoff.

The automated suites emit existing Starlette HTTP-client and SQLite date-adapter
deprecation warnings. These are not failed assertions; dependency maintenance
should address them before a runtime upgrade removes those compatibility paths.

## Remaining release dependencies

See PILOT_RUNBOOK.md and REGIONAL_SOURCES.md. Hosting TLS/domain, installed backup
schedule/off-host retention, actual external monitoring, independent privacy and
security/accessibility review, pilot user acceptance and a verified regional data
adapter remain operator/external/product dependencies. No mocked connector,
notification delivery or regulatory/clinical certification is claimed.

## Regional weekly review iteration — 2026-11-08

The project owner selected regional public-health analysts in Alberta as the
intended pilot audience. This is not an institutional partnership or evidence of
user acceptance. Product scope, discovery questions and unmeasured acceptance
criteria are recorded in PRODUCT_DIRECTION.md.

Migration 0010 was applied to a backup-protected native preview and preserved all
11 locations, 156 observations, 3,190,006 reported cases, 296 case revisions,
one feed and existing publication/history records. Foreign-key checks passed.
Existing population estimates remained unconfirmed. Regression testing caught and
fixed SQLite AUTOINCREMENT loss during table reconstruction; a migration test now
also preserves a previously deleted high location ID. The location editor retains
existing province/state designations when only denominator details change.

An actual TLS-verified PHAC CSV download and authenticated native API request
verified Alberta laboratory context (week ending 2026-10-31, COVID-19 test
positivity 3.9%; unavailable influenza/RSV remain missing). This is distinct from
deterministic fixture tests and does not establish an Alberta incident-case
feed or guarantee continued source availability. No laboratory values were written
to Case, alert, investigation or public-publication tables.

Local checks: 138 SQLite tests passed; PostgreSQL passed 136 tests with two
SQLite-specific checks skipped. Frontend production build, lint, formatting and
15 unit tests passed. Eight Playwright workflows passed, including denominator editing, private
evidence export, source failure isolation, investigation handoff and mobile
layout. CI status is provided in the implementation handoff. Pilot interviews, partner agreements, permitted Alberta
case exports, operational deployment and measured impact remain external work.
