import AccountSecurity from '../components/AccountSecurity'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/context'
import Dialog from '../components/Dialog'
import LoadState from '../components/LoadState'
import LocationEditor from '../components/LocationEditor'
import { api, errorMessage, setToken } from '../lib/api'
import type { Location, Role, User } from '../lib/types'
import { useApi } from '../lib/useApi'

export default function Settings() {
  const { user } = useAuth()
  const writable = user?.role !== 'public'
  const users = useApi<User[]>(user?.role === 'admin' ? '/auth/users' : null)
  const locations = useApi<Location[]>('/locations?include_archived=true')
  const [showArchived, setShowArchived] = useState(false)
  const [locationAction, setLocationAction] = useState<{
    kind: 'delete' | 'archive' | 'restore'
    location: Location
  } | null>(null)
  const usage = useApi<{ can_delete: boolean; references: Record<string, number> }>(
    locationAction ? `/locations/${locationAction.location.id}/usage` : null,
  )
  const visibleLocations = locations.data?.filter(
    (location) => showArchived || !location.archived_at,
  )
  const [edit, setEdit] = useState<Location | 'new' | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  async function changeRole(id: number, role: Role) {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await api(`/auth/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) })
      users.reload()
      setStatus('Access updated. Existing sessions for that account have been revoked.')
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form))
    setBusy(true)
    setError('')
    try {
      await api('/auth/password', { method: 'POST', body: JSON.stringify(body) })
      setToken(null)
      window.dispatchEvent(new Event('session-expired'))
      form.reset()
    } catch (error) {
      if (errorMessage(error) !== 'Sign in to continue') setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function applyLocationAction(kind: 'delete' | 'archive' | 'restore') {
    if (!locationAction) return
    setBusy(true)
    setError('')
    try {
      await api(`/locations/${locationAction.location.id}${kind === 'delete' ? '' : `/${kind}`}`, {
        method: kind === 'delete' ? 'DELETE' : 'POST',
      })
      setLocationAction(null)
      locations.reload()
      setStatus(
        kind === 'delete'
          ? 'Unused location deleted.'
          : kind === 'archive'
            ? 'Location archived. Linked history is retained; feeds and location-specific rules are paused.'
            : 'Location restored. Paused feeds and rules remain paused until you enable them.',
      )
    } catch (error) {
      setError(errorMessage(error))
      usage.reload()
    } finally {
      setBusy(false)
    }
  }
  const current = edit && edit !== 'new' ? edit : null
  return (
    <>
      <AccountSecurity />
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE MANAGEMENT</p>
          <h1>Settings</h1>
          <p className="muted">Manage your account, geographic locations and access.</p>
        </div>
      </div>
      {error && !edit && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
      <div className="chart-grid">
        <section className="panel">
          <h2>Your account</h2>
          <dl className="details">
            <dt>Username</dt>
            <dd>{user?.username}</dd>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
            <dt>Access</dt>
            <dd>
              <span className="badge low">{user?.role}</span>
            </dd>
          </dl>
          <p className="muted">
            Public accounts can read approved publications. Analysts manage private observations,
            locations and resources. Administrators also manage account access.
          </p>
        </section>
        <section className="panel">
          <h2>Change password</h2>
          <p className="muted">Changing your password signs out all your sessions.</p>
          <form onSubmit={changePassword} className="form-stack">
            <label>
              Current password
              <input
                type="password"
                name="current_password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                name="new_password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
              />
            </label>
            {user?.mfa_enabled && (
              <label>
                Authenticator code
                <input name="otp" pattern="[0-9]{6}" autoComplete="one-time-code" required />
              </label>
            )}
            <button disabled={busy}>Change password</button>
          </form>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Locations</h2>
          {writable && (
            <button
              onClick={() => {
                setEdit('new')
                setError('')
              }}
            >
              Add location +
            </button>
          )}
        </div>
        <p className="muted">
          Delete unused places, or archive places with linked records to preserve their history.
          Archived places can be restored.
        </p>
        <label className="check-option">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived locations
        </label>
        <LoadState loading={locations.loading} error={locations.error} retry={locations.reload} />
        {locations.data &&
          (visibleLocations?.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Map position</th>
                    <th>Population</th>
                    <th>Administrative level</th>
                    {writable && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleLocations.map((l) => (
                    <tr key={l.id}>
                      <td>{l.name}</td>
                      <td>
                        <span className="status-pill">{l.archived_at ? 'Archived' : 'Active'}</span>
                      </td>
                      <td>
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}#map=11/${l.latitude}/${l.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View on map ↗
                        </a>
                      </td>
                      <td>{l.population?.toLocaleString() ?? '—'}</td>
                      <td>{l.administrative_level || '—'}</td>
                      {writable && (
                        <td>
                          <button
                            onClick={() => {
                              setEdit(l)
                              setError('')
                            }}
                          >
                            Edit
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => {
                              setLocationAction({
                                kind: l.archived_at ? 'restore' : 'archive',
                                location: l,
                              })
                              setError('')
                              setStatus('')
                            }}
                          >
                            {l.archived_at ? 'Restore' : 'Archive'}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => {
                              setLocationAction({ kind: 'delete', location: l })
                              setError('')
                              setStatus('')
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">
              No active locations in this view. Add a place or show archived locations to restore
              one.
            </p>
          ))}
      </section>
      {user?.role === 'admin' && (
        <section className="panel">
          <h2>Account access</h2>
          <LoadState loading={users.loading} error={users.error} retry={users.reload} />
          {users.data && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.map((u) => (
                    <tr key={u.id}>
                      <td>
                        {u.username}
                        {u.id === user.id ? ' (you)' : ''}
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <select
                          aria-label={`Role for ${u.username}`}
                          value={u.role}
                          disabled={busy || u.id === user.id}
                          onChange={(e) => void changeRole(u.id, e.target.value as Role)}
                        >
                          {['public', 'analyst', 'admin'].map((role) => (
                            <option key={role}>{role}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {locationAction && (
        <Dialog
          title={`${locationAction.kind === 'delete' ? 'Delete' : locationAction.kind === 'archive' ? 'Archive' : 'Restore'} location`}
          close={() => {
            if (!busy) setLocationAction(null)
          }}
        >
          <p>
            <strong>{locationAction.location.name}</strong>
          </p>
          <LoadState loading={usage.loading} error={usage.error} retry={usage.reload} />
          {usage.data && (
            <>
              {Object.values(usage.data.references).some((count) => count > 0) && (
                <>
                  <p>Linked records and history:</p>
                  <ul>
                    {Object.entries(usage.data.references)
                      .filter(([, count]) => count > 0)
                      .map(([label, count]) => (
                        <li key={label}>
                          {label.replaceAll('_', ' ')}: {count}
                        </li>
                      ))}
                  </ul>
                </>
              )}
              {locationAction.kind === 'delete' ? (
                usage.data.can_delete ? (
                  <p>
                    This unused location has no linked records. Deletion cannot be undone. A
                    lifecycle audit entry is retained.
                  </p>
                ) : (
                  <p className="notice">
                    This location has linked records or history and cannot be deleted.{' '}
                    {locationAction.location.archived_at
                      ? 'It is already archived; its history is retained.'
                      : 'Archive it instead to preserve its history.'}
                  </p>
                )
              ) : locationAction.kind === 'archive' ? (
                <>
                  <p>
                    This hides the location from active maps, overview totals and new-location
                    selectors. Reports, investigations, resources and audit history are retained.
                  </p>
                  <p>
                    Its feeds and location-specific alert rules will be paused. Existing published
                    snapshots remain public until an administrator withdraws them in Publication
                    review.
                  </p>
                </>
              ) : (
                <p>
                  This returns the location to active maps and selectors. Previously paused feeds
                  and alert rules stay paused until you enable them.
                </p>
              )}
              <div className="actions">
                <button disabled={busy} onClick={() => setLocationAction(null)}>
                  Cancel
                </button>
                {(locationAction.kind !== 'delete' || usage.data.can_delete) && (
                  <button
                    className={locationAction.kind === 'delete' ? 'danger' : 'primary'}
                    disabled={busy}
                    onClick={() => void applyLocationAction(locationAction.kind)}
                  >
                    {busy
                      ? 'Working…'
                      : locationAction.kind === 'delete'
                        ? 'Delete unused location'
                        : locationAction.kind === 'archive'
                          ? 'Archive location'
                          : 'Restore location'}
                  </button>
                )}
                {locationAction.kind === 'delete' &&
                  !usage.data.can_delete &&
                  !locationAction.location.archived_at && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => setLocationAction({ ...locationAction, kind: 'archive' })}
                    >
                      Archive instead
                    </button>
                  )}
              </div>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
      {edit && (
        <Dialog
          title={edit === 'new' ? 'Add location' : 'Edit location'}
          close={() => {
            if (!busy) setEdit(null)
          }}
        >
          <LocationEditor
            location={current}
            onBusyChange={setBusy}
            onSaved={() => {
              setEdit(null)
              locations.reload()
              setStatus('Location saved.')
            }}
          />
        </Dialog>
      )}
    </>
  )
}
