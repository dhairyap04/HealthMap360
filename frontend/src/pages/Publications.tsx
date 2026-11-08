import { useWorkspaceDate } from '../lib/workspaceDate'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { api, errorMessage } from '../lib/api'
import { useApi } from '../lib/useApi'
import type { Location } from '../lib/types'
import type { Outbreak } from '../lib/surveillance'
import type { PublishedReport } from './PublicPortal'
import LoadState from '../components/LoadState'
type Draft = { id: number; status: string; payload: PublishedReport; created_at: string }
export default function Publications() {
  const today = useWorkspaceDate()
  const { user } = useAuth()
  const drafts = useApi<Draft[]>('/publications')
  const locations = useApi<Location[]>('/locations')
  const outbreaks = useApi<Outbreak[]>('/outbreaks')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [reviewed, setReviewed] = useState<Record<number, boolean>>({})
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      await api('/publications', {
        method: 'POST',
        body: JSON.stringify({
          ...Object.fromEntries(form),
          location_id: Number(form.get('location_id')),
          outbreak_id: form.get('outbreak_id') ? Number(form.get('outbreak_id')) : null,
          suppression_threshold: Number(form.get('suppression_threshold')),
        }),
      })
      setShow(false)
      drafts.reload()
      setStatus(
        'Private draft created. An administrator must review the snapshot before publication.',
      )
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  async function decide(id: number, action: string) {
    setBusy(true)
    setError('')
    try {
      await api(`/publications/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ reviewed: reviewed[id] || false }),
      })
      drafts.reload()
      setStatus(
        action === 'publish'
          ? 'Snapshot published. Previous matching snapshot was superseded.'
          : 'Publication withdrawn. Its public URL is no longer available.',
      )
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONTROLLED PUBLICATION</p>
          <h1>Publication review</h1>
          <p className="muted">
            Private drafts become immutable public snapshots only after administrator review.
          </p>
        </div>
        <button className="primary" onClick={() => setShow(!show)}>
          Prepare publication
        </button>
      </div>
      <p className="notice">
        Existing reports stay private. Demo observations and unresolved conflicts cannot be
        published. Source corrections require a new reviewed snapshot. Withdrawal stops future
        access but cannot recall copies already downloaded.
      </p>
      <Link className="button" to="/public">
        Open public reports →
      </Link>
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
      {show && (
        <form className="panel form-stack" onSubmit={create}>
          <h2>Prepare a private snapshot</h2>
          <label>
            Reporting area
            <select name="location_id" required>
              <option value="">Choose one reporting area…</option>
              {locations.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.geographic_scope}
                </option>
              ))}
            </select>
          </label>
          <label>
            Investigation (optional)
            <select name="outbreak_id">
              <option value="">Area reports, independent of investigations</option>
              {outbreaks.data?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Disease
            <input name="disease" required maxLength={120} placeholder="covid-19" />
          </label>
          <div className="form-columns">
            <label>
              First report date
              <input name="date_from" type="date" required />
            </label>
            <label>
              Last report date
              <input name="date_to" type="date" required max={today} />
            </label>
          </div>
          <label>
            Public title
            <input name="title" required minLength={5} maxLength={200} />
          </label>
          <label>
            Public reporting area name
            <input name="public_name" required minLength={2} maxLength={200} />
          </label>
          <label>
            Public summary
            <textarea name="summary" required minLength={10} maxLength={5000} />
          </label>
          <label>
            Methodology and limitations
            <textarea name="methodology" required minLength={20} maxLength={5000} />
          </label>
          <label>
            Public source name
            <input name="source_name" required minLength={3} maxLength={200} />
          </label>
          <label>
            Source methodology URL
            <input name="source_url" type="url" required maxLength={500} />
          </label>
          <label>
            Withhold counts below
            <input
              name="suppression_threshold"
              type="number"
              min={5}
              max={100}
              defaultValue={5}
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            Create private draft
          </button>
        </form>
      )}
      <LoadState loading={drafts.loading} error={drafts.error} retry={drafts.reload} />
      <div className="feed-list">
        {drafts.data?.map((draft) => (
          <article className="panel" key={draft.id}>
            <div className="panel-heading">
              <h2>{draft.payload.title}</h2>
              <span className="status-pill">{draft.status}</span>
            </div>
            <p>
              {draft.payload.location.name} · {draft.payload.disease} · {draft.payload.date_from} →{' '}
              {draft.payload.date_to}
            </p>
            <p>
              <strong>
                {draft.payload.total_cases === null
                  ? 'Withheld'
                  : draft.payload.total_cases.toLocaleString()}
              </strong>{' '}
              reported cases
            </p>
            <p className="prose-text">{draft.payload.summary}</p>
            <p className="muted">{draft.payload.methodology}</p>
            <a href={draft.payload.source_url} target="_blank" rel="noreferrer">
              {draft.payload.source_name}
            </a>
            <details>
              <summary>Review individual reporting dates</summary>
              <ul>
                {draft.payload.reports.map((row) => (
                  <li key={row.date}>
                    {row.date} · {row.reporting_period_days} day report ·{' '}
                    {row.cases === null ? 'Withheld' : row.cases.toLocaleString()}
                  </li>
                ))}
              </ul>
            </details>
            {user?.role === 'admin' && draft.status === 'draft' && (
              <>
                <label className="check-option">
                  <input
                    type="checkbox"
                    checked={reviewed[draft.id] || false}
                    onChange={(e) => setReviewed({ ...reviewed, [draft.id]: e.target.checked })}
                  />
                  I reviewed the source, dates, public text, reporting area, and
                  small-count/location privacy.
                </label>
                <button
                  className="primary"
                  disabled={busy || !reviewed[draft.id]}
                  onClick={() => void decide(draft.id, 'publish')}
                >
                  Publish reviewed snapshot
                </button>
              </>
            )}
            {user?.role === 'admin' && draft.status === 'published' && (
              <button disabled={busy} onClick={() => void decide(draft.id, 'withdraw')}>
                Withdraw publication
              </button>
            )}
          </article>
        ))}
      </div>
    </>
  )
}
