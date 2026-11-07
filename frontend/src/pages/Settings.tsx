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
  const locations = useApi<Location[]>('/locations')
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
  const current = edit && edit !== 'new' ? edit : null
  return (
    <>
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
            Public accounts can view and export data. Analysts manage observations, locations and
            resources. Administrators also manage account access.
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
        <LoadState loading={locations.loading} error={locations.error} retry={locations.reload} />
        {locations.data &&
          (locations.data.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Map position</th>
                    <th>Population</th>
                    <th>Administrative level</th>
                    {writable && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {locations.data.map((l) => (
                    <tr key={l.id}>
                      <td>{l.name}</td>
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
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">
              Search for a city, region or address to add your first location.
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
