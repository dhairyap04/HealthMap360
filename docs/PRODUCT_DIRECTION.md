# HealthMap360: regional surveillance pilot

## Purpose and boundaries

HealthMap360 helps public-health teams bring trusted disease reports together,
review changes, coordinate human follow-up, and communicate reviewed findings.
The first intended audience, selected by the project owner, is regional
public-health analysts in Alberta monitoring respiratory disease. This audience
choice is a product direction, not evidence of an institutional partnership or
an accepted clinical/public-health deployment.

The primary workflow is collect → understand → review → coordinate → communicate.
The private workspace supports analysts; public visitors receive only approved
publication snapshots. Resource inventory remains lightweight. Patient records,
contact tracing, clinical severity inference and outbreak prediction are outside
this iteration. New source adapters must answer a specific decision question.

## Implemented weekly workflow

1. Save the exact reporting region and country/region identifiers in Settings.
2. Import permitted incident reported-case data; WHO remains national context.
3. Open Weekly review, select one disease, area and week-ending date. Default
   geography is regional/Canada and Alberta is selected when saved. The default
   week ends on the most recent Saturday, matching PHAC Sunday–Saturday weeks.
4. Review both seven-day periods, coverage, sources and reporting cadence.
   Missing/conflicting/partial weeks do not produce a comparison. Source/cadence
   changes, demonstration provenance and intervals crossing the week boundary
   block comparison. Counts in incomplete windows are partial recorded totals;
   no missing days are imputed and no weekly values are prorated.
5. Rates are crude reported cases per 100,000 for a single disease/area/week.
   They require complete sourced coverage and a positive population, source URL,
   reference year matching the entire week, and explicit matching-area
   confirmation. Existing populations are unconfirmed after migration. Population
   updates retain before/after history. Rates do not correct testing differences,
   do not estimate all infections, and are not age-standardized.
6. Load optional official PHAC laboratory context for a Canadian province or
   territory. Test positivity, tests and detections remain separate metrics.
   The latest available common source week on/before the selected end is shown
   explicitly. Missing virus values are never carried forward or made zero.
   Retrieval time does not imply recent reporting. The connector is read-only,
   on-demand, and cached for 15 minutes; it does not create cases, alert rules,
   publications or scheduled jobs. Download limits and invalid/ambiguous records
   fail visibly. The case review remains usable if PHAC is unavailable.
7. Review existing open investigations before creating one. Creation prefills
   disease, area and start date, but requires an owner/priority review and explicit
   observation linking. It does not declare an epidemiological outbreak.
8. Export the private JSON evidence bundle with optional analyst notes and loaded
   laboratory context. Notes are not saved automatically; investigations provide
   persistent ownership and activity. Public distribution still uses separate
   Publication review. No combined cross-area total is produced.

## Data source status

- WHO weekly country COVID-19: existing persisted/scheduled case connector.
- PHAC FluWatch+ provincial laboratory results: verified official CSV, separate
  read-only context. Definitions: https://health-infobase.canada.ca/respiratory-virus-surveillance/about.html
- Alberta incident cases: manual reviewed CSV path. No stable permitted automatic
  Alberta case export is asserted. Missing data cannot be fixed by inventing city
  estimates or importing season-to-date totals as new cases.
- Additional hospital/wastewater indicators: deferred until a pilot decision
  question, definitions, units and permitted data access are established.

## Pilot discovery and acceptance plan — not yet performed

Recruit approximately five to eight intended users through an authorized
project owner or partner. No outreach is sent by the application. Ask users to
walk through a real weekly review using their existing tools before demonstrating
HealthMap360. Record jurisdiction, responsibilities, sources, definitions,
report-preparation time, reconciliation work, follow-up handoffs and existing
systems. Do not collect patient records in interview notes.

Select one recurring task with a willing partner. Agree on the decision question,
source permissions, operator responsibilities, privacy review, existing baseline,
and success measures before a limited pilot. Run for four reporting cycles if
appropriate to partner schedules. Suggested measures:

| Measure | Baseline | Pilot result |
| --- | --- | --- |
| Minutes to prepare and verify weekly review | To measure | To measure |
| Manual source reconciliation steps | To measure | To measure |
| Signals reviewed / useful follow-ups / noisy signals | To measure | To measure |
| Follow-ups with owner and documented next action | To measure | To measure |
| Missing or revised data correctly understood | To measure | To measure |
| Public readers correctly identify area, period, freshness and source | To measure | To measure |

No adoption, time savings, improved health outcomes or user acceptance is claimed
until measured. Revise the workflow if it duplicates an effective existing tool.
A source connection alone is not product-market validation. Hosting, independent
security/privacy/accessibility review and operational responsibilities remain
release gates in PILOT_RUNBOOK.md.

## Feature admission rule

A proposed feature must have a named intended user, recurring decision/task,
verified data path, clear interpretation, maintainable ownership and an observable
benefit. Prefer strengthening the existing workflow over adding a new module.
