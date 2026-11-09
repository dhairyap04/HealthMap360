import type { Summary } from '../lib/types'
export default function ReportingContext({ view }: { view: Summary['view'] }) {
  return (
    <section className="reporting-context" aria-label="Reporting context">
      <div>
        <span className="status-pill">
          {view.time_window === 'historical'
            ? 'Historical range'
            : view.time_window === 'latest'
              ? 'Latest available week'
              : 'Last 28 days'}
        </span>
        {view.historical && (
          <span className="status-pill stale">Historical source · over 30 days old</span>
        )}
      </div>
      <p>
        <strong>
          {view.geographic_scope[0].toUpperCase() + view.geographic_scope.slice(1)} reports
        </strong>{' '}
        · {view.date_from || 'No reports'}
        {view.date_to ? ` → ${view.date_to}` : ''}
        {' · '}Latest available report: {view.latest_report_date || 'None'}
      </p>
      <p className="muted">
        {view.reporting_periods.length
          ? view.reporting_periods
              .map((period) => (period === 7 ? 'Weekly reports' : 'Daily reports'))
              .join(' + ')
          : 'No reports in this window'}{' '}
        · Missing reports do not mean zero.
      </p>
      <details className="context-details">
        <summary>How to read these reports</summary>
        <p className="muted">
          {view.reporting_periods.length
            ? view.reporting_periods
                .map((p) => (p === 7 ? 'Weekly reports' : 'Daily reports'))
                .join(' + ')
            : 'No reports in this window'}
          . Counts are attributed to report dates; weekly reports cover the preceding seven days.
          Missing reports do not mean zero cases. National, regional and local totals are kept
          separate.
        </p>
      </details>
      {view.sources.length > 0 && (
        <small className="muted">Sources: {view.sources.join(' · ')}</small>
      )}
    </section>
  )
}
