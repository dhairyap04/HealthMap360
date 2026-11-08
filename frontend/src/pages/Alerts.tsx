import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/context'
import Dialog from '../components/Dialog'
import FilterSelect from '../components/FilterSelect'
import LoadState from '../components/LoadState'
import { api, errorMessage, query } from '../lib/api'
import type { Alert, AlertRule } from '../lib/surveillance'
import type { Location } from '../lib/types'
import { useApi } from '../lib/useApi'

export default function Alerts() {
  const { user } = useAuth()
  const writable = user?.role !== 'public'
  const [filter, setFilter] = useState('open')
  const alerts = useApi<Alert[]>(`/alerts${query({ status: filter })}`)
  const rules = useApi<AlertRule[]>('/alert-rules')
  const locations = useApi<Location[]>('/locations')
  const [editing, setEditing] = useState<AlertRule | 'new' | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))
  useEffect(() => {
    const timer = setInterval(alerts.reload, 60000)
    return () => clearInterval(timer)
  }, [alerts.reload])
  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = {
      name: form.get('name'),
      disease: form.get('disease') || null,
      location_id: form.get('location_id') ? Number(form.get('location_id')) : null,
      threshold: Number(form.get('threshold')),
      window_days: Number(form.get('window_days')),
      severity: form.get('severity'),
      enabled: form.get('enabled') === 'on',
    }
    setBusy(true)
    setError('')
    try {
      await api(editing === 'new' ? '/alert-rules' : `/alert-rules/${(editing as AlertRule).id}`, {
        method: editing === 'new' ? 'POST' : 'PUT',
        body: JSON.stringify(body),
      })
      setEditing(null)
      rules.reload()
      alerts.reload()
      setStatus('Alert rule saved and evaluated against current reports.')
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function action(id: number, action: string) {
    setBusy(true)
    setError('')
    try {
      await api(`/alerts/${id}/action`, { method: 'POST', body: JSON.stringify({ action }) })
      alerts.reload()
      setStatus(action === 'resolve' ? 'Alert resolved.' : 'Alert acknowledged.')
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function evaluate() {
    setBusy(true)
    setError('')
    try {
      const result = await api<{ created: number }>(`/alerts/evaluate${query({ as_of: asOf })}`, {
        method: 'POST',
      })
      alerts.reload()
      setStatus(`Evaluation complete for ${asOf}: ${result.created} new alerts.`)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const current = editing && editing !== 'new' ? editing : null
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SIGNALS & FOLLOW-UP</p>
          <h1>Alerts</h1>
          <p className="muted">Review rule-based signals and coordinate follow-up.</p>
        </div>
        {writable && (
          <button
            className="primary"
            onClick={() => {
              setEditing('new')
              setError('')
            }}
          >
            New alert rule +
          </button>
        )}
      </div>
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
      {error && !editing && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="filters">
        <FilterSelect
          label="Alert status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: '', label: 'All alerts' },
            { value: 'open', label: 'New alerts' },
            { value: 'acknowledged', label: 'Acknowledged' },
            { value: 'resolved', label: 'Resolved' },
          ]}
        />
        {writable && (
          <>
            <label>
              Evaluate through
              <input
                type="date"
                value={asOf}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </label>
            <button disabled={busy || !asOf} onClick={() => void evaluate()}>
              Evaluate rules
            </button>
          </>
        )}
      </div>
      <p className="muted">
        Thresholds are evaluated separately for each disease and location using counts attributed to
        report dates. They are review signals, not diagnoses. In-app alerts refresh every minute.
      </p>
      <LoadState loading={alerts.loading} error={alerts.error} retry={alerts.reload} />
      {alerts.data &&
        (alerts.data.length ? (
          <div className="alert-list">
            {alerts.data.map((alert) => (
              <article key={alert.id} className={`panel alert-card alert-${alert.severity}`}>
                <div className="panel-heading">
                  <div>
                    <span className={`badge ${alert.severity}`}>{alert.severity}</span>{' '}
                    <span className="status-pill">{alert.status}</span>
                  </div>
                  <span className="muted">
                    {alert.window_start} → {alert.window_end}
                  </span>
                </div>
                <h2>{alert.rule_name}</h2>
                <p>
                  {alert.location_name} · {alert.disease}
                </p>
                <p className="alert-count">
                  <strong>{alert.value.toLocaleString()}</strong> reported cases · threshold{' '}
                  {alert.threshold.toLocaleString()}
                </p>
                {alert.resolution && <p className="muted">{alert.resolution}</p>}
                {writable && alert.status !== 'resolved' && (
                  <div className="actions">
                    {alert.status === 'open' && (
                      <button disabled={busy} onClick={() => void action(alert.id, 'acknowledge')}>
                        Acknowledge
                      </button>
                    )}
                    <button disabled={busy} onClick={() => void action(alert.id, 'resolve')}>
                      Resolve
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <section className="panel empty">
            <h2>No alerts in this view</h2>
            <p>Alerts appear when a saved rule meets its threshold.</p>
          </section>
        ))}
      <section className="panel">
        <h2>Alert rules</h2>
        <LoadState
          loading={rules.loading || locations.loading}
          error={rules.error || locations.error}
          retry={() => {
            rules.reload()
            locations.reload()
          }}
        />
        {rules.data &&
          (rules.data.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Scope</th>
                    <th>Threshold</th>
                    <th>Window</th>
                    <th>Status</th>
                    {writable && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {rules.data.map((rule) => (
                    <tr key={rule.id}>
                      <td>{rule.name}</td>
                      <td>
                        {rule.disease || 'Each disease'} ·{' '}
                        {locations.data?.find((l) => l.id === rule.location_id)?.name ||
                          'Each location'}
                      </td>
                      <td>{rule.threshold} reported cases</td>
                      <td>{rule.window_days} days</td>
                      <td>{rule.enabled ? 'Enabled' : 'Paused'}</td>
                      {writable && (
                        <td>
                          <button
                            onClick={() => {
                              setEditing(rule)
                              setError('')
                            }}
                          >
                            Edit rule
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No rules configured.</p>
          ))}
      </section>
      {editing && (
        <Dialog
          title={editing === 'new' ? 'New alert rule' : 'Edit alert rule'}
          close={() => {
            if (!busy) setEditing(null)
          }}
        >
          <form onSubmit={saveRule} className="form-stack">
            <label>
              Rule name
              <input name="name" required maxLength={160} defaultValue={current?.name} />
            </label>
            <label>
              Disease (optional)
              <input
                name="disease"
                maxLength={120}
                defaultValue={current?.disease || ''}
                placeholder="Blank evaluates each disease separately"
              />
            </label>
            <label>
              Location scope
              <select name="location_id" defaultValue={current?.location_id || ''}>
                <option value="">Each location separately</option>
                {locations.data?.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-columns">
              <label>
                Case threshold
                <input
                  name="threshold"
                  type="number"
                  min={1}
                  max={2147483647}
                  required
                  defaultValue={current?.threshold || 10}
                />
              </label>
              <label>
                Reporting window (days)
                <input
                  name="window_days"
                  type="number"
                  min={1}
                  max={90}
                  required
                  defaultValue={current?.window_days || 7}
                />
              </label>
            </div>
            <label>
              Alert priority
              <select name="severity" defaultValue={current?.severity || 'medium'}>
                {['low', 'medium', 'high', 'critical'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="check-option">
              <input name="enabled" type="checkbox" defaultChecked={current?.enabled ?? true} />
              Enable rule
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Save rule
            </button>
          </form>
        </Dialog>
      )}
    </>
  )
}
