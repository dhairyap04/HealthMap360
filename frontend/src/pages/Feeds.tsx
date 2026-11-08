import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context'
import Dialog from '../components/Dialog'
import LoadState from '../components/LoadState'
import { api, errorMessage } from '../lib/api'
import type { Feed, FeedCatalog, FeedRun } from '../lib/surveillance'
import { dateTime } from '../lib/surveillance'
import type { Location } from '../lib/types'
import { useApi } from '../lib/useApi'

export default function Feeds() {
  const { user } = useAuth()
  const writable = user?.role !== 'public'
  const feeds = useApi<Feed[]>('/feeds')
  const worker = useApi<{ online: boolean; last_tick_at: string | null }>('/feeds/worker-status')
  const [editing, setEditing] = useState<Feed | 'new' | null>(null)
  const [historyId, setHistoryId] = useState<number | null>(null)
  const history = useApi<FeedRun[]>(historyId ? `/feeds/${historyId}/runs` : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const reloadFeeds = feeds.reload
  const reloadHistory = history.reload
  const reloadWorker = worker.reload
  useEffect(() => {
    const timer = setInterval(() => {
      reloadFeeds()
      reloadWorker()
      if (historyId) reloadHistory()
    }, 60000)
    return () => clearInterval(timer)
  }, [reloadFeeds, reloadHistory, reloadWorker, historyId])
  async function sync(feed: Feed) {
    setBusy(true)
    setError('')
    setStatus('')
    setHistoryId(feed.id)
    try {
      const result = await api<FeedRun>(`/feeds/${feed.id}/sync`, { method: 'POST' })
      if (result.status === 'failed') setError(result.message)
      else
        setStatus(
          `Sync complete: ${result.imported} imported, ${result.updated} revised, ${result.skipped} unchanged. ${result.message}`,
        )
      feeds.reload()
      history.reload()
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function toggle(feed: Feed) {
    setBusy(true)
    setError('')
    try {
      await api(`/feeds/${feed.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...feed, enabled: !feed.enabled }),
      })
      feeds.reload()
      setStatus(
        feed.enabled
          ? 'Feed paused. Existing observations are retained.'
          : 'Feed enabled and queued for synchronization.',
      )
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONNECTED SURVEILLANCE</p>
          <h1>External data feeds</h1>
          <p className="muted">
            Connect trusted sources, review syncs and track source corrections.
          </p>
        </div>
        {writable && (
          <button
            className="primary"
            onClick={() => {
              setEditing('new')
              setError('')
            }}
          >
            Connect feed +
          </button>
        )}
      </div>
      <section className="panel source-intro">
        <div>
          <span className="status-pill">LIVE CONNECTOR</span>
          <h2>WHO COVID-19 · weekly country reports</h2>
          <p className="muted">
            Official country-level reports attributed to reporting weeks. Reporting frequency and
            completeness vary. Missing reports remain missing, and negative source adjustments stop
            the import for review.
          </p>
        </div>
        <a href="https://data.who.int/dashboards/covid19/data" target="_blank" rel="noreferrer">
          View source & methodology ↗
        </a>
      </section>
      {worker.data && (
        <p className={worker.data.online ? 'muted' : 'notice'} role="status">
          {worker.data.online
            ? `Scheduled refreshes are running · last checked ${dateTime(worker.data.last_tick_at)}`
            : 'Scheduled refreshes are offline. You can still use Sync now; start the background worker to enable automatic updates.'}
        </p>
      )}
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <LoadState loading={feeds.loading} error={feeds.error} retry={feeds.reload} />
      {feeds.data &&
        (feeds.data.length ? (
          <div className="feed-list">
            {feeds.data.map((feed) => (
              <section className="panel" key={feed.id}>
                <div className="panel-heading">
                  <div>
                    <h2>{feed.name}</h2>
                    <p className="muted">
                      WHO · {feed.country_code} → {feed.location_name}
                    </p>
                  </div>
                  <span
                    className={`status-pill ${feed.last_error ? 'failed' : feed.enabled ? 'active' : ''}`}
                  >
                    {feed.last_error ? 'Needs attention' : feed.enabled ? 'Enabled' : 'Paused'}
                  </span>
                </div>
                <div className="feed-metadata">
                  <span>
                    <small>LAST SUCCESSFUL SYNC</small>
                    {dateTime(feed.last_synced_at)}
                  </span>
                  <span>
                    <small>REFRESH INTERVAL</small>
                    {feed.interval_minutes >= 1440
                      ? `${feed.interval_minutes / 1440} day(s)`
                      : `${feed.interval_minutes / 60} hour(s)`}
                  </span>
                  <span>
                    <small>REPORTS SINCE</small>
                    {feed.start_date}
                  </span>
                  <span>
                    <small>REVIEW SEVERITY</small>
                    <span className={`badge ${feed.severity}`}>{feed.severity}</span>
                  </span>
                </div>
                {feed.last_error && <p className="error">{feed.last_error}</p>}
                <div className="actions">
                  {writable && (
                    <>
                      <button
                        className="primary"
                        disabled={busy || !feed.enabled}
                        onClick={() => void sync(feed)}
                      >
                        {busy ? 'Working…' : 'Sync now'}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setEditing(feed)
                          setError('')
                        }}
                      >
                        Edit feed
                      </button>
                      <button disabled={busy} onClick={() => void toggle(feed)}>
                        {feed.enabled ? 'Pause' : 'Enable'}
                      </button>
                    </>
                  )}
                  <button onClick={() => setHistoryId(feed.id)}>View sync history</button>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <section className="panel empty">
            <h2>No feeds connected</h2>
            <p>Add a country location in Settings, then connect its WHO country code here.</p>
            <Link className="button" to="/settings">
              Manage locations
            </Link>
          </section>
        ))}
      {historyId && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Sync history · {feeds.data?.find((feed) => feed.id === historyId)?.name}</h2>
            <button onClick={() => setHistoryId(null)}>Close history</button>
          </div>
          <LoadState loading={history.loading} error={history.error} retry={history.reload} />
          {history.data &&
            (history.data.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Status</th>
                      <th>New</th>
                      <th>Revised</th>
                      <th>Unchanged</th>
                      <th>Latest source report</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.map((run) => (
                      <tr key={run.id}>
                        <td>{dateTime(run.started_at)}</td>
                        <td>
                          <span className={`status-pill ${run.status}`}>{run.status}</span>
                        </td>
                        <td>{run.imported}</td>
                        <td>{run.updated}</td>
                        <td>{run.skipped}</td>
                        <td>{run.latest_report_date || '—'}</td>
                        <td>{run.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">
                No sync attempts yet. Choose Sync now, or wait for the next scheduled refresh.
              </p>
            ))}
        </section>
      )}
      {editing && (
        <Dialog
          title={editing === 'new' ? 'Connect WHO feed' : 'Edit WHO feed'}
          close={() => setEditing(null)}
        >
          <FeedForm
            feed={editing === 'new' ? undefined : editing}
            saved={(feed) => {
              setEditing(null)
              setHistoryId(feed.id)
              feeds.reload()
              worker.reload()
              setStatus(
                'Feed saved. Enabled feeds are queued for the scheduled worker; use Sync now to run immediately.',
              )
            }}
          />
        </Dialog>
      )}
    </>
  )
}
function FeedForm({ feed, saved }: { feed?: Feed; saved: (feed: Feed) => void }) {
  const catalog = useApi<FeedCatalog>(feed ? null : '/feeds/catalog')
  const locations = useApi<Location[]>('/locations')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const countries =
    locations.data?.filter(
      (location) => location.administrative_level?.toLowerCase() === 'country',
    ) || []
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 90)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const body = {
      name: fields.get('name'),
      provider: 'who_covid_weekly',
      country_code: feed?.country_code || fields.get('country_code'),
      location_id: feed?.location_id || Number(fields.get('location_id')),
      severity: fields.get('severity'),
      start_date: fields.get('start_date'),
      interval_minutes: Number(fields.get('interval_minutes')),
      enabled: fields.get('enabled') === 'on',
    }
    setBusy(true)
    setError('')
    try {
      saved(
        await api<Feed>(feed ? `/feeds/${feed.id}` : '/feeds', {
          method: feed ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        }),
      )
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <p className="muted">
        Match the source country to the same saved country. National reports must not be assigned to
        a city.
      </p>
      <LoadState
        loading={catalog.loading || locations.loading}
        error={catalog.error || locations.error}
        retry={() => {
          catalog.reload()
          locations.reload()
        }}
      />
      <label>
        Feed name
        <input
          name="name"
          required
          maxLength={160}
          defaultValue={feed?.name}
          placeholder="e.g. WHO COVID-19 · Canada"
        />
      </label>
      <label>
        Source country
        <select
          name="country_code"
          required
          disabled={Boolean(feed)}
          defaultValue={feed?.country_code || ''}
        >
          <option value="">Choose source country…</option>
          {(
            catalog.data?.countries ||
            (feed ? [{ code: feed.country_code, name: feed.country_code }] : [])
          ).map((country) => (
            <option key={country.code} value={country.code}>
              {country.name} ({country.code})
            </option>
          ))}
        </select>
      </label>
      <label>
        Saved country location
        <select
          name="location_id"
          required
          disabled={Boolean(feed)}
          defaultValue={feed?.location_id || ''}
        >
          <option value="">Choose matching saved country…</option>
          {countries.map((location) => (
            <option value={location.id} key={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      {!locations.loading && !countries.length && (
        <p className="notice">
          Add a country through Settings → Add location first, then return here.
        </p>
      )}
      <div className="form-columns">
        <label>
          Import reports since
          <input
            name="start_date"
            type="date"
            min="2020-01-01"
            max={new Date().toISOString().slice(0, 10)}
            required
            defaultValue={feed?.start_date || since.toISOString().slice(0, 10)}
          />
        </label>
        <label>
          Refresh schedule
          <select name="interval_minutes" defaultValue={feed?.interval_minutes || 1440}>
            <option value={60}>Hourly</option>
            <option value={360}>Every 6 hours</option>
            <option value={1440}>Daily</option>
            <option value={10080}>Weekly</option>
          </select>
        </label>
      </div>
      <label>
        Review severity
        <select name="severity" defaultValue={feed?.severity || 'low'}>
          {['low', 'medium', 'high', 'critical'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <p className="muted">
        Severity is your review label for new imported records; WHO does not supply this
        classification. Changed source counts are audited. Manually corrected records are protected
        from overwrite.
      </p>
      <label className="check-option">
        <input type="checkbox" name="enabled" defaultChecked={feed?.enabled ?? true} />
        Enable scheduled synchronization
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary"
        disabled={
          busy ||
          catalog.loading ||
          locations.loading ||
          !countries.length ||
          Boolean(catalog.error || locations.error)
        }
      >
        {busy ? 'Saving…' : feed ? 'Save feed' : 'Connect feed'}
      </button>
    </form>
  )
}
