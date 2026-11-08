import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { api, errorMessage, query } from '../lib/api'
import { useApi } from '../lib/useApi'
import LoadState from '../components/LoadState'
import { dateTime } from '../lib/surveillance'
export type PublishedReport = {
  id: number
  title: string
  summary: string
  methodology: string
  source_name: string
  source_url: string
  location: { id: number; name: string; geographic_scope: string }
  disease: string
  date_from: string
  date_to: string
  latest_report_date: string
  published_at: string
  total_cases: number | null
  suppressed: boolean
  suppression_threshold: number
  historical: boolean
  reports: { date: string; cases: number | null; reporting_period_days: number }[]
  investigation_status: string | null
  note: string
}
export default function PublicPortal() {
  const { user, signOut } = useAuth()
  const { locationId } = useParams()
  const [params, setParams] = useSearchParams()
  const [error, setError] = useState('')
  const [account, setAccount] = useState(false)
  const reports = useApi<{ items: PublishedReport[]; has_more: boolean; page: number }>(
    `/public/reports${query({ location_id: locationId, disease: params.get('disease'), page: params.get('page') || 1 })}`,
  )
  return (
    <div className="public-shell">
      <header className="public-header">
        <Link to="/public" className="brand">
          H+ HealthMap360
        </Link>
        <nav aria-label="Public navigation">
          {user ? (
            <>
              <span>Read access · {user.username}</span>
              <button onClick={() => setAccount(!account)}>Account security</button>
              <button
                onClick={() => {
                  void signOut().catch((e) => setError(errorMessage(e)))
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link className="button" to="/">
              Analyst sign in
            </Link>
          )}
          {user && user.role !== 'public' && (
            <Link className="button" to="/">
              Analyst workspace
            </Link>
          )}
        </nav>
      </header>
      <main className="page">
        {account && user && (
          <form
            className="panel form-stack"
            onSubmit={(event) => {
              event.preventDefault()
              const body = Object.fromEntries(new FormData(event.currentTarget))
              void api('/auth/password', { method: 'POST', body: JSON.stringify(body) })
                .then(() => signOut())
                .catch((e) => setError(errorMessage(e)))
            }}
          >
            <h2>Change your password</h2>
            <label>
              Current password
              <input
                name="current_password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              New password
              <input
                name="new_password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
              />
            </label>
            {user.mfa_enabled && (
              <label>
                Authenticator code
                <input name="otp" pattern="[0-9]{6}" autoComplete="one-time-code" required />
              </label>
            )}
            <button>Change password and end sessions</button>
          </form>
        )}
        <p className="eyebrow">PUBLISHED SURVEILLANCE</p>
        <h1>Public health reports</h1>
        <p className="muted">
          Reviewed information for a reporting area. Each report is an approved snapshot; reports
          from different places or versions must not be added together.
        </p>
        <div className="notice">
          Reported cases are not active infections. Missing reports do not mean zero. Source
          reporting can be delayed and revised.
        </div>
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            setParams(form.get('disease') ? { disease: String(form.get('disease')) } : {})
          }}
        >
          <label>
            Disease
            <input
              name="disease"
              defaultValue={params.get('disease') || ''}
              placeholder="e.g. covid-19"
              maxLength={120}
            />
          </label>
          <button>Apply</button>
          <button type="button" onClick={() => setParams({})}>
            Reset
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <LoadState loading={reports.loading} error={reports.error} retry={reports.reload} />
        {reports.data && !reports.data.items.length && (
          <section className="panel empty">
            <h2>No published reports in this view</h2>
            <p>
              Information appears here after source and publication review. No published information
              does not mean no disease activity.
            </p>
          </section>
        )}
        <div className="public-reports">
          {reports.data?.items.map((report) => (
            <article className="panel" key={report.id}>
              <p className="eyebrow">
                {report.location.geographic_scope} · {report.disease}
              </p>
              <h2>{report.title}</h2>
              <Link to={`/public/locations/${report.location.id}`}>{report.location.name} →</Link>
              <p className="prose-text">{report.summary}</p>
              <p>
                <strong>
                  {report.total_cases === null ? 'Withheld' : report.total_cases.toLocaleString()}
                </strong>{' '}
                reported cases · {report.date_from} → {report.date_to}
              </p>
              <p>
                Latest report: <strong>{report.latest_report_date}</strong> · Published{' '}
                {dateTime(report.published_at)}
              </p>
              {report.historical && (
                <p className="notice">Historical source · latest report is over 30 days old.</p>
              )}
              {report.investigation_status && (
                <p>
                  Investigation status at publication: {report.investigation_status}. This is an
                  analyst-maintained status.
                </p>
              )}
              {report.suppressed && (
                <p className="notice">
                  Counts below {report.suppression_threshold} and reconstructable totals are
                  withheld for privacy.
                </p>
              )}
              <details>
                <summary>Reporting timeline and methodology</summary>
                <p className="prose-text">{report.methodology}</p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Report date</th>
                        <th>Reporting period</th>
                        <th>Reported cases</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.reports.map((row) => (
                        <tr key={row.date}>
                          <td>{row.date}</td>
                          <td>{row.reporting_period_days === 7 ? 'Weekly' : 'Daily'}</td>
                          <td>{row.cases === null ? 'Withheld' : row.cases.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <p>
                <a href={report.source_url} target="_blank" rel="noreferrer">
                  {report.source_name} · source and definitions ↗
                </a>
              </p>
              <small className="muted">{report.note}</small>
            </article>
          ))}
        </div>
        {reports.data && (
          <div className="pagination">
            <button
              disabled={reports.data.page <= 1}
              onClick={() =>
                setParams({ ...Object.fromEntries(params), page: String(reports.data!.page - 1) })
              }
            >
              Previous
            </button>
            <span>Page {reports.data.page}</span>
            <button
              disabled={!reports.data.has_more}
              onClick={() =>
                setParams({ ...Object.fromEntries(params), page: String(reports.data!.page + 1) })
              }
            >
              Next
            </button>
          </div>
        )}
      </main>
      <footer>HealthMap360 · Published aggregate information</footer>
    </div>
  )
}
