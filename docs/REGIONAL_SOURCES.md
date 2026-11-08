# Regional source assessment — 2026-11-07

The implementation retains WHO's weekly country-case connector. The weekly review now also offers read-only provincial PHAC laboratory context; no automatic regional reported-case connector is claimed.

## Alberta respiratory surveillance

Official dashboard and historical page:
https://www.alberta.ca/stats/dashboard/respiratory-virus-dashboard.htm?data=historical-data

The inspected page distinguishes seasonal cumulative cases, admissions and deaths.
Its page text reported an update on November 5 with reporting through October 31,
2026. These are source observations at assessment time, not application freshness
promises. A direct automated HTTPS retrieval in the development environment
returned HTTP 403. This does not prove there is no reusable export; it means a
stable permitted case-series endpoint and its reuse conditions have not been
verified. We do not bypass access controls or scrape rendered summary totals.
Season-to-date totals must not be imported as new daily/weekly cases.

## PHAC FluWatch+ and wastewater

Official downloads and definitions:
https://health-infobase.canada.ca/respiratory-virus-surveillance/explore.html
https://health-infobase.canada.ca/respiratory-virus-surveillance/about.html
https://health-infobase.canada.ca/wastewater/

PHAC describes downloadable laboratory and clinical data, changing reporting
coverage, retrospective revisions and surveillance weeks running Sunday–Saturday.
Sentinel laboratory positive detections are not interchangeable with population
case counts. Test positivity is a percentage; wastewater is a concentration or
normalized signal. The current canonical table stores reported cases only.
A responsible adapter for those streams requires a separately typed metric and
unit model, data dictionary mapping, geographic coverage validation, source reuse
review and actual-download integration checks. They must not be labeled as cases.

## Supported path now

1. Obtain a permitted export and review its definitions and geographic coverage.
2. Save the exact province/health reporting area in Settings first. Assign its
   reporting geography; health regions are not necessarily province boundaries.
3. Use the CSV mapper for nonnegative **incident reported cases** only, with
   report-ending date, disease, case_count, source and reporting_period_days (1/7).
   An optional metric column must equal reported_cases. Other metrics are rejected.
4. Validate the full file and review conflicts. Adjacent weekly periods are valid;
   overlapping daily/weekly observations are rejected atomically. Source revisions
   require an explicit correction, not a second overlapping row.
5. All observations stay private until a separately reviewed publication snapshot.
   Demo provenance is blocked from publication. Unverified manual source data
   requires source/methodology and publication privacy review.

Next external dependency: identify an official, reusable Alberta incident-case
export, or design and validate a typed PHAC metric adapter. No mock fixture is
presented as proof of either integration.

## PHAC laboratory context — implementation verified 2026-11-08

The official Explore page JavaScript references this downloadable provincial CSV:
https://health-infobase.canada.ca/src/data/respiratory-virus-detections/download/RVD_WeeklyData.csv

An actual TLS-verified download returned 720 records with province, reporting date,
virus, tests, detections and percent-positive fields. The adapter selects exact
province identifiers and the aggregate Influenza series (never sums aggregate and
subtypes). It shows only COVID-19, Influenza and RSV at one common source week.
At verification, Alberta's latest included week was 2026-10-31: 4,639 tests,
181 SARS-CoV-2 detections and 3.9% positive. Influenza and RSV were unavailable for
that area/week and stay unavailable. These are a dated integration observation,
not a freshness or future-availability promise. The live adapter performs no case
writes, interpolation, public publication or background scheduling. Tests use
deterministic source fixtures separately from this actual-download verification.
