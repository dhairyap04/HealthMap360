import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useAuth } from '../auth/context'
import Dialog from '../components/Dialog'
import FilterSelect from '../components/FilterSelect'
import LoadState from '../components/LoadState'
import OutbreakForm from '../components/OutbreakForm'
import { api, errorMessage, query } from '../lib/api'
import type { Outbreak, OutbreakDetail as Detail } from '../lib/surveillance'
import { dateTime } from '../lib/surveillance'
import type { Observation, Page } from '../lib/types'
import { useApi } from '../lib/useApi'

export default function Outbreaks() {
  const { id } = useParams()
  return id ? <OutbreakDetail id={Number(id)} /> : <OutbreakList />
}
function OutbreakList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const outbreaks = useApi<Outbreak[]>(`/outbreaks${query({ status })}`)
  const [create, setCreate] = useState(false)
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">INVESTIGATIONS & RESPONSE</p>
          <h1>Outbreak tracking</h1>
          <p className="muted">
            Follow investigations from the first signal through containment and closure.
          </p>
        </div>
        {user?.role !== 'public' && (
          <button className="primary" onClick={() => setCreate(true)}>
            New investigation +
          </button>
        )}
      </div>
      <div className="filters">
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'All investigations' },
            ...['investigating', 'active', 'contained', 'closed'].map((value) => ({
              value,
              label: value[0].toUpperCase() + value.slice(1),
            })),
          ]}
        />
      </div>
      <LoadState loading={outbreaks.loading} error={outbreaks.error} retry={outbreaks.reload} />
      {outbreaks.data &&
        (outbreaks.data.length ? (
          <div className="investigation-grid">
            {outbreaks.data.map((outbreak) => (
              <Link
                key={outbreak.id}
                to={`/outbreaks/${outbreak.id}`}
                className="panel investigation-card"
              >
                <div className="panel-heading">
                  <span className={`badge ${outbreak.priority}`}>{outbreak.priority} priority</span>
                  <span className={`status-pill ${outbreak.status}`}>{outbreak.status}</span>
                </div>
                <h2>{outbreak.title}</h2>
                <p className="muted">
                  {outbreak.disease} · {outbreak.locations.map((l) => l.name).join(', ')}
                </p>
                <div className="investigation-numbers">
                  <strong>
                    {outbreak.reported_cases?.toLocaleString() ?? 'By reporting area'}
                    <small>linked reported cases</small>
                  </strong>
                  <strong>
                    {outbreak.observations}
                    <small>observations</small>
                  </strong>
                </div>
                <div className="investigation-footer">
                  <span>Owner: {outbreak.owner}</span>
                  <span>View investigation →</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <section className="panel empty">
            <h2>No investigations in this view</h2>
            <p>Create an investigation, choose its locations, and link matching observations.</p>
          </section>
        ))}
      {create && (
        <Dialog title="New investigation" close={() => setCreate(false)}>
          <OutbreakForm saved={(id) => navigate(`/outbreaks/${id}`)} />
        </Dialog>
      )}
    </>
  )
}
function OutbreakDetail({ id }: { id: number }) {
  const { user } = useAuth()
  const writable = user?.role !== 'public'
  const detail = useApi<Detail>(`/outbreaks/${id}`)
  const [candidates, setCandidates] = useState(false)
  const [page, setPage] = useState(1)
  const records = useApi<Page<Observation>>(
    `/outbreaks/${id}/observations${query({ candidates, page })}`,
  )
  const [selected, setSelected] = useState<number[]>([])
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const reload = () => {
    detail.reload()
    records.reload()
    setSelected([])
  }
  async function link() {
    setBusy(true)
    setError('')
    try {
      await api(`/outbreaks/${id}/observations`, {
        method: 'POST',
        body: JSON.stringify({
          observation_ids: selected,
          action: candidates ? 'attach' : 'detach',
        }),
      })
      reload()
      setStatus(candidates ? 'Observations linked.' : 'Observations unlinked.')
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setError('')
    try {
      await api(`/outbreaks/${id}/updates`, {
        method: 'POST',
        body: JSON.stringify({ body: new FormData(form).get('body') }),
      })
      form.reset()
      detail.reload()
      setStatus('Situation update saved.')
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const outbreak = detail.data
  return (
    <>
      <Link to="/outbreaks" className="back-link">
        ← All investigations
      </Link>
      <LoadState loading={detail.loading} error={detail.error} retry={detail.reload} />
      {outbreak && (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">INVESTIGATION #{id}</p>
              <h1>{outbreak.title}</h1>
              <p className="muted">
                {outbreak.disease} · {outbreak.started_on}
                {outbreak.ended_on ? ` to ${outbreak.ended_on}` : ' onward'} · Owner:{' '}
                {outbreak.owner}
              </p>
            </div>
            {writable && <button onClick={() => setEditing(true)}>Edit investigation</button>}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {status && (
            <p className="success" role="status">
              {status}
            </p>
          )}
          <div className="stats-grid">
            <section className="stat">
              <p>Linked reported cases</p>
              <strong>{outbreak.reported_cases?.toLocaleString() ?? 'By reporting area'}</strong>
              <small>{outbreak.aggregation_note}</small>
            </section>
            <section className="stat">
              <p>Observations</p>
              <strong>{outbreak.observations}</strong>
              <small>Daily or weekly reporting periods</small>
            </section>
            <section className="stat">
              <p>Status</p>
              <strong className="stat-word">{outbreak.status}</strong>
              <span className={`badge ${outbreak.priority}`}>{outbreak.priority} priority</span>
            </section>
            <section className="stat">
              <p>Tracked locations</p>
              <strong>{outbreak.locations.length}</strong>
              <small>{outbreak.locations.map((l) => l.name).join(', ')}</small>
            </section>
          </div>
          {outbreak.totals_by_location?.length > 0 && (
            <section className="panel">
              <h2>Separate reporting area totals</h2>
              <p className="muted">
                {outbreak.aggregation_note} {outbreak.excluded_for_review || 0} observations
                excluded pending conflict review.
              </p>
              <div className="location-list">
                {outbreak.totals_by_location.map((area) => (
                  <div key={area.location_id}>
                    <span>
                      {area.location_name} · {area.geographic_scope}
                    </span>
                    <strong>{area.cases.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}
          <div className="chart-grid">
            <section className="panel">
              <h2>Situation summary</h2>
              <p className="prose-text">
                {outbreak.description || 'No situation summary has been added.'}
              </p>
              <p className="muted">
                Link observations explicitly after reviewing their reporting period and source.
                Location-wide totals are not automatically assigned to an investigation.
              </p>
            </section>
            <section className="panel">
              <h2>Linked cases by report date</h2>
              {outbreak.trend?.length ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={outbreak.trend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis width={35} allowDecimals={false} />
                    <Tooltip />
                    <Line
                      dataKey="cases"
                      stroke="#087f78"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="empty">Link observations to see a reporting timeline.</p>
              )}
            </section>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <h2>{candidates ? 'Available observations' : 'Linked observations'}</h2>
              {writable && (
                <div className="segmented">
                  <button
                    className={!candidates ? 'selected' : ''}
                    onClick={() => {
                      setCandidates(false)
                      setPage(1)
                      setSelected([])
                    }}
                  >
                    Linked
                  </button>
                  <button
                    className={candidates ? 'selected' : ''}
                    onClick={() => {
                      setCandidates(true)
                      setPage(1)
                      setSelected([])
                    }}
                  >
                    Available to link
                  </button>
                </div>
              )}
            </div>
            <LoadState loading={records.loading} error={records.error} retry={records.reload} />
            {records.data && (
              <>
                {records.data.items.length ? (
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Investigation observations"
                  >
                    <table>
                      <thead>
                        <tr>
                          {writable && <th scope="col">Select</th>}
                          <th scope="col">Report date</th>
                          <th scope="col">Location</th>
                          <th scope="col">Cases</th>
                          <th scope="col">Period</th>
                          <th scope="col">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.data.items.map((row) => (
                          <tr key={row.id}>
                            {writable && (
                              <td>
                                <input
                                  className="row-checkbox"
                                  type="checkbox"
                                  aria-label={`Select observation ${row.id}`}
                                  checked={selected.includes(row.id)}
                                  onChange={(e) =>
                                    setSelected(
                                      e.target.checked
                                        ? [...selected, row.id]
                                        : selected.filter((i) => i !== row.id),
                                    )
                                  }
                                />
                              </td>
                            )}
                            <td>{row.date}</td>
                            <td>{row.location.name}</td>
                            <td>{row.case_count}</td>
                            <td>{row.reporting_period_days === 7 ? 'Weekly' : 'Daily'}</td>
                            <td>{row.source || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="empty">
                    {candidates
                      ? 'No unassigned observations match this investigation’s disease, locations and dates.'
                      : 'No observations linked yet.'}
                  </p>
                )}
                <div className="pagination">
                  {writable && (
                    <button
                      className="primary"
                      disabled={busy || !selected.length || outbreak.status === 'closed'}
                      onClick={() => void link()}
                    >
                      {candidates ? 'Link selected' : 'Unlink selected'}
                    </button>
                  )}
                  <button
                    disabled={page === 1}
                    onClick={() => {
                      setPage(page - 1)
                      setSelected([])
                    }}
                  >
                    Previous
                  </button>
                  <span>
                    Page {page} · {records.data.total} records
                  </span>
                  <button
                    disabled={page * 50 >= records.data.total}
                    onClick={() => {
                      setPage(page + 1)
                      setSelected([])
                    }}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </section>
          <section className="panel">
            <h2>Situation updates & activity</h2>
            {writable && (
              <form onSubmit={addNote} className="form-stack">
                <label>
                  Situation update
                  <textarea
                    name="body"
                    required
                    maxLength={5000}
                    rows={3}
                    placeholder="Record a response action or investigation update…"
                  />
                </label>
                <button disabled={busy}>Post update</button>
              </form>
            )}
            <div className="activity-list">
              {outbreak.updates.map((update) => (
                <article key={update.id}>
                  <div>
                    <strong>{update.username}</strong>
                    <time>{dateTime(update.created_at)}</time>
                    <span className="status-pill">{update.kind}</span>
                  </div>
                  <p className="prose-text">{update.body}</p>
                </article>
              ))}
            </div>
          </section>
          {editing && (
            <Dialog title="Edit investigation" close={() => setEditing(false)}>
              <OutbreakForm
                outbreak={outbreak}
                saved={() => {
                  setEditing(false)
                  reload()
                  setStatus('Investigation updated.')
                }}
              />
            </Dialog>
          )}
        </>
      )}
    </>
  )
}
