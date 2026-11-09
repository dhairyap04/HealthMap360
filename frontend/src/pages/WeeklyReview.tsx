import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Dialog from '../components/Dialog'
import FilterSelect from '../components/FilterSelect'
import LoadState from '../components/LoadState'
import OutbreakForm from '../components/OutbreakForm'
import { query } from '../lib/api'
import type { LaboratoryContext, ReviewArea, WeeklyReview as Review } from '../lib/review'
import type { GeographicScope, Location } from '../lib/types'
import { dateTime } from '../lib/surveillance'
import { useApi } from '../lib/useApi'
import { useWorkspaceDate } from '../lib/workspaceDate'

const display = (value: number | null) => (value === null ? 'Unavailable' : value.toLocaleString())
export default function WeeklyReview() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const today = useWorkspaceDate()
  const demo = params.get('demo')
  const isDemo = demo !== null
  const locations = useApi<Location[]>(isDemo ? null : '/locations')
  const diseases = useApi<string[]>(isDemo ? null : '/diseases')
  const scope = (
    ['local', 'regional', 'national'].includes(params.get('geographic_scope') || '')
      ? params.get('geographic_scope')
      : 'regional'
  ) as GeographicScope
  const available = (locations.data || []).filter(
    (l) => l.country_code === 'CA' && l.geographic_scope === scope,
  )
  const locationId =
    params.get('location_id') ??
    String(scope === 'regional' ? available.find((l) => l.region_code === 'CA-AB')?.id || '' : '')
  const disease = params.get('disease') || 'covid-19'
  const end = params.get('date_to') || ''
  const review = useApi<Review>(
    isDemo
      ? `/review/demo${query({ scenario: demo || 'complete' })}`
      : locations.loading
        ? null
        : `/review/weekly${query({ geographic_scope: scope, country_code: 'CA', location_id: locationId, disease, date_to: end })}`,
  )
  const selected = available.find((l) => String(l.id) === locationId)
  const [laboratoryRequest, setLaboratoryRequest] = useState<string | null>(null)
  const contextPath =
    !isDemo && selected?.geographic_scope === 'regional' && selected.region_code
      ? `/review/laboratory${query({ location_id: selected.id, date_to: end })}`
      : null
  const laboratory = useApi<LaboratoryContext>(
    laboratoryRequest === contextPath ? contextPath : null,
  )
  const [investigate, setInvestigate] = useState<ReviewArea | null>(null)
  const [notes, setNotes] = useState('')
  function change(key: string, value: string) {
    const next = new URLSearchParams(params)
    next.set(key, value)
    if (key === 'geographic_scope') next.set('location_id', '')
    setLaboratoryRequest(null)
    setNotes('')
    setParams(next)
  }
  function download() {
    if (!review.data) return
    const body = {
      status: isDemo
        ? 'fictional_demonstration_not_for_publication'
        : 'private_working_review_not_approved_for_publication',
      ...review.data,
      analyst_notes: notes,
      laboratory_context: contextPath && laboratoryRequest === contextPath ? laboratory.data : null,
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `healthmap360-private-review-${review.data.date_to}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">REGIONAL SURVEILLANCE PILOT · CANADA</p>
          <h1>Weekly review</h1>
          <p className="muted">
            Review reported changes, check the evidence and coordinate follow-up.
          </p>
        </div>
        <button onClick={download} disabled={!review.data}>
          Export private review
        </button>
      </div>
      <div className="actions" style={{ marginBottom: 20 }}>
        <Link className="button" to={isDemo ? '/review' : '/review?demo=complete'}>
          {isDemo ? 'Return to live review' : 'Try a fictional demo'}
        </Link>
      </div>
      {isDemo ? (
        <section className="panel" aria-label="Demo walkthrough">
          <span className="status-pill">FICTIONAL DEMO · READ ONLY</span>
          <h2>Learn the weekly review</h2>
          <p>
            These examples use a fictional Alberta reporting area, influenza counts and a population
            of 1,000,000. They do not describe actual disease activity.
          </p>
          <div className="actions">
            <Link
              className={`button ${demo === 'complete' ? 'primary' : ''}`}
              to="/review?demo=complete"
            >
              1. Complete reporting
            </Link>
            <Link
              className={`button ${demo === 'incomplete' ? 'primary' : ''}`}
              to="/review?demo=incomplete"
            >
              2. Incomplete reporting
            </Link>
            <Link
              className={`button ${demo === 'population' ? 'primary' : ''}`}
              to="/review?demo=population"
            >
              3. Missing population
            </Link>
          </div>
          <p>
            {demo === 'incomplete'
              ? 'Only three days are reported this week. The app shows the 60 recorded cases, but withholds the comparison and rate because four days are missing.'
              : demo === 'population'
                ? 'The weeks are complete, so 100 → 150 is a 50% increase. The rate remains unavailable because the population reference year and coverage are unconfirmed.'
                : 'Compare 100 cases in the previous week with 150 in the selected week: 50 more cases, a 50% increase. With a fictional population of 1,000,000, the selected week equals 15 reported cases per 100,000.'}
          </p>
          <p className="muted">
            In a real review, check sources and existing investigations, then assign an owner and
            explicitly link relevant observations. Demo records cannot start investigations or be
            published.
          </p>
        </section>
      ) : (
        <section className="panel">
          <p>
            Designed for regional public-health analysts, starting with respiratory surveillance in
            Alberta. Select one disease and reporting week; each area is reviewed separately.
          </p>
          <div className="filters">
            <FilterSelect
              label="Review geography"
              value={scope}
              onChange={(v) => change('geographic_scope', v)}
              options={['regional', 'local', 'national'].map((value) => ({
                value,
                label: value[0].toUpperCase() + value.slice(1),
              }))}
            />
            <FilterSelect
              label="Review area"
              value={locationId}
              onChange={(v) => change('location_id', v)}
              options={[
                { value: '', label: 'All Canadian reporting areas' },
                ...available.map((l) => ({ value: String(l.id), label: l.name })),
              ]}
            />
            <FilterSelect
              label="Review disease"
              value={disease}
              onChange={(v) => change('disease', v)}
              options={[...new Set(['covid-19', 'influenza', 'rsv', ...(diseases.data || [])])].map(
                (value) => ({ value, label: value }),
              )}
            />
            <label>
              Week ending
              <input
                type="date"
                aria-label="Review week ending"
                max={today}
                value={end || review.data?.date_to || ''}
                onChange={(e) => change('date_to', e.target.value)}
              />
            </label>
          </div>
          <small className="muted">
            Default: latest Saturday. Weekly source reports must align with the selected seven-day
            window; dates are never prorated.
          </small>
        </section>
      )}
      <LoadState
        loading={(!isDemo && locations.loading) || review.loading}
        error={locations.error || review.error}
        retry={() => {
          locations.reload()
          review.reload()
        }}
      />
      {review.data && Boolean(review.data.demonstration) === isDemo && (
        <>
          <p className="notice">{review.data.note}</p>
          <p>
            {review.data.date_from} – {review.data.date_to} · generated{' '}
            {dateTime(review.data.generated_at)}
            {review.data.historical ? ' · Historical reporting week' : ''}
          </p>
          {review.data.truncated && (
            <p className="notice">
              Only the first 500 areas are shown. Select an area to narrow the review.
            </p>
          )}
          {!review.data.areas.length && (
            <section className="panel empty">
              <h2>No matching reporting areas</h2>
              <p>
                Save the exact reporting region in Settings with its country and geography. Adding a
                region does not automatically retrieve case reports.
              </p>
              <Link to="/settings">Manage reporting areas →</Link>
            </section>
          )}
          {review.data.areas.map((area) => (
            <section
              className="panel"
              key={area.location_id}
              aria-label={`${area.location_name} weekly review`}
            >
              <div className="panel-heading">
                <h2>{area.location_name}</h2>
                <span className="status-pill">{area.current.state.replaceAll('_', ' ')}</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Reporting window</th>
                      <th>Reported cases</th>
                      <th>Days covered</th>
                      <th>Review state</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[area.current, area.previous].map((window, i) => (
                      <tr key={i}>
                        <td>
                          {i === 0 ? 'Selected' : 'Previous'} · {window.date_from} –{' '}
                          {window.date_to}
                        </td>
                        <td>{display(window.reported_cases)}</td>
                        <td>{window.covered_days} / 7</td>
                        <td>{window.state.replaceAll('_', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Week-to-week change:{' '}
                <strong>
                  {area.comparison.absolute_change === null
                    ? 'Unavailable'
                    : `${area.comparison.absolute_change > 0 ? '+' : ''}${area.comparison.absolute_change.toLocaleString()} reported cases`}
                </strong>
                {area.comparison.percent_change !== null
                  ? ` (${area.comparison.percent_change > 0 ? '+' : ''}${area.comparison.percent_change}%)`
                  : ''}
              </p>
              {area.comparison.unavailable_reason && (
                <p className="muted">{area.comparison.unavailable_reason}</p>
              )}
              {area.comparison.absolute_change !== null && area.previous.reported_cases === 0 && (
                <p className="muted">
                  Percentage change is undefined when the previous week is zero.
                </p>
              )}
              <p>
                Reported cases per 100,000 people:{' '}
                <strong>{display(area.rate.reported_cases_per_100000)}</strong>
              </p>
              {area.rate.unavailable_reason ? (
                <p className="muted">
                  {area.rate.unavailable_reason}{' '}
                  {!isDemo && <Link to="/settings">Review population details →</Link>}
                </p>
              ) : (
                <p className="muted">
                  Population {display(area.rate.population)} · reference year{' '}
                  {area.rate.reference_year} ·{' '}
                  {isDemo ? (
                    <span>Fictional denominator for training</span>
                  ) : (
                    <a href={area.rate.source_url || undefined} target="_blank" rel="noreferrer">
                      Population source ↗
                    </a>
                  )}
                  . Crude reported-case rate; not an individual risk estimate.
                </p>
              )}
              <p className="muted">
                Current sources:{' '}
                {area.current.sources.filter(Boolean).join(' · ') || 'Not recorded'} · cadence:{' '}
                {area.current.reporting_periods.map((days) => `${days}-day`).join(', ') ||
                  'Unavailable'}
              </p>
              {!isDemo && (
                <div className="actions">
                  <Link
                    className="button"
                    to={`/reports${query({ location_id: area.location_id, disease, date_from: area.current.date_from, date_to: area.current.date_to })}`}
                  >
                    Review supporting reports
                  </Link>
                  <button onClick={() => setInvestigate(area)}>Start investigation</button>
                </div>
              )}
              {!!area.investigations.length && (
                <div>
                  <p>Existing open investigations — check these before creating another:</p>
                  <ul>
                    {area.investigations.map((item) => (
                      <li key={item.id}>
                        <Link to={`/outbreaks/${item.id}`}>{item.title}</Link> · {item.status}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
          {!isDemo && (
            <section className="panel">
              <h2>Provincial laboratory context</h2>
              <p>
                Official PHAC test positivity is a separate indicator. Detections are laboratory
                results, not additional case observations, and are never added to case totals.
              </p>
              {contextPath ? (
                <button
                  onClick={() => {
                    setLaboratoryRequest(contextPath)
                    laboratory.reload()
                  }}
                  disabled={laboratoryRequest === contextPath && laboratory.loading}
                >
                  Load PHAC laboratory context
                </button>
              ) : (
                <p className="muted">
                  Select a Canadian province or territory with a region identifier to load its
                  laboratory data. City-level estimates are not provided.
                </p>
              )}
              {laboratoryRequest === contextPath && contextPath && (
                <LoadState
                  loading={laboratory.loading}
                  error={laboratory.error}
                  retry={laboratory.reload}
                />
              )}
              {contextPath && laboratoryRequest === contextPath && laboratory.data && (
                <>
                  <p>
                    {laboratory.data.source_name} · {laboratory.data.reporting_area} · week ending{' '}
                    {laboratory.data.latest_report_date || 'unavailable'}
                    {laboratory.data.historical ? ' · Historical data' : ''}
                  </p>
                  <p className="muted">
                    Retrieved {dateTime(laboratory.data.retrieved_at)}. This source week may differ
                    from your selected case week.
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Virus</th>
                          <th>Tests</th>
                          <th>Detections</th>
                          <th>Tests positive</th>
                        </tr>
                      </thead>
                      <tbody>
                        {laboratory.data.indicators.map((item) => (
                          <tr key={item.virus}>
                            <td>{item.virus}</td>
                            <td>{display(item.tests)}</td>
                            <td>{display(item.detections)}</td>
                            <td>
                              {item.percent_positive === null
                                ? 'Unavailable'
                                : `${item.percent_positive}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="muted">{laboratory.data.limitations}</p>
                  <div className="actions">
                    <a href={laboratory.data.source_url} target="_blank" rel="noreferrer">
                      Official download ↗
                    </a>
                    <a href={laboratory.data.methodology_url} target="_blank" rel="noreferrer">
                      Definitions and methodology ↗
                    </a>
                  </div>
                </>
              )}
            </section>
          )}
          <section className="panel form-stack">
            <h2>Review notes and handoff</h2>
            <label>
              Analyst notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={5000}
                rows={4}
                placeholder="Interpretation, limitations, follow-up owner and next review date…"
              />
            </label>
            <p className="muted">
              Notes are included in the private export and are not saved automatically. Use an
              investigation for a persistent owner and activity history. Publishing requires the
              separate Publication review process.
            </p>
            {!isDemo && <Link to="/publications">Open publication review →</Link>}
          </section>
        </>
      )}
      {!isDemo && investigate && review.data && (
        <Dialog title="Start investigation from weekly review" close={() => setInvestigate(null)}>
          <p>
            Review the owner and response priority. Supporting observations must be linked
            explicitly after creation.
          </p>
          <OutbreakForm
            initial={{
              title: `${investigate.location_name} · ${disease} review`.slice(0, 200),
              disease,
              started_on: review.data.date_from,
              location_id: investigate.location_id,
            }}
            saved={(id) => navigate(`/outbreaks/${id}`)}
          />
        </Dialog>
      )}
    </>
  )
}
