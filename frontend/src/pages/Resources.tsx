import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/context'
import Dialog from '../components/Dialog'
import LoadState from '../components/LoadState'
import FilterSelect from '../components/FilterSelect'
import { api, errorMessage, query } from '../lib/api'
import type { Location, Resource } from '../lib/types'
import { useApi } from '../lib/useApi'

export default function Resources() {
  const { user } = useAuth()
  const writable = user?.role !== 'public'
  const [location, setLocation] = useState('')
  const resources = useApi<Resource[]>(`/resources${query({ location_id: location })}`)
  const locations = useApi<Location[]>('/locations?include_archived=true')
  const [edit, setEdit] = useState<Resource | 'new' | null>(null)
  const [remove, setRemove] = useState<Resource | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = Object.fromEntries(new FormData(event.currentTarget))
    const body = {
      type: form.type,
      quantity: Number(form.quantity),
      location_id: form.location_id ? Number(form.location_id) : null,
      allocated_date: form.allocated_date || null,
    }
    setBusy(true)
    setError('')
    try {
      await api(edit === 'new' ? '/resources' : `/resources/${(edit as Resource).id}`, {
        method: edit === 'new' ? 'POST' : 'PUT',
        body: JSON.stringify(body),
      })
      setEdit(null)
      resources.reload()
      setStatus('Resource saved.')
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function deleteResource() {
    if (!remove) return
    setBusy(true)
    setError('')
    try {
      await api(`/resources/${remove.id}`, { method: 'DELETE' })
      setRemove(null)
      resources.reload()
      setStatus('Resource deleted.')
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const current = edit && edit !== 'new' ? edit : null
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RESPONSE COORDINATION</p>
          <h1>Resources</h1>
          <p className="muted">Track stock quantities and assign resources to locations.</p>
        </div>
        {writable && (
          <button
            className="primary"
            onClick={() => {
              setEdit('new')
              setError('')
            }}
          >
            Add resource +
          </button>
        )}
      </div>
      <div className="filters">
        <FilterSelect
          label="Location"
          value={location}
          onChange={setLocation}
          disabled={locations.loading}
          options={[
            { value: '', label: 'All locations and unassigned stock' },
            ...(locations.data || []).map((l) => ({ value: String(l.id), label: l.name })),
          ]}
        />
      </div>
      <LoadState
        loading={resources.loading || locations.loading}
        error={resources.error || locations.error}
        retry={() => {
          resources.reload()
          locations.reload()
        }}
      />
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
      {resources.data && (
        <section className="panel">
          <h2>Resource inventory</h2>
          <p className="muted">
            Each entry represents a stock quantity at one location, or unassigned stock. These
            counts do not indicate remaining clinical capacity.
          </p>
          {!resources.data.length ? (
            <p className="empty">No resources in this view.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>Quantity</th>
                    <th>Assigned location</th>
                    <th>Allocation date</th>
                    {writable && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {resources.data.map((r) => (
                    <tr key={r.id}>
                      <td>{r.type}</td>
                      <td>{r.quantity.toLocaleString()}</td>
                      <td>{r.location?.name || 'Unassigned'}</td>
                      <td>{r.allocated_date || '—'}</td>
                      {writable && (
                        <td className="actions">
                          <button
                            onClick={() => {
                              setEdit(r)
                              setError('')
                            }}
                          >
                            Edit / allocate
                          </button>
                          <button
                            className="danger-text"
                            onClick={() => {
                              setRemove(r)
                              setError('')
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
          )}
        </section>
      )}
      {edit && (
        <Dialog
          title={edit === 'new' ? 'Add resource' : 'Edit resource allocation'}
          close={() => {
            if (!busy) setEdit(null)
          }}
        >
          <form onSubmit={save} className="form-stack">
            <label>
              Resource type
              <input
                name="type"
                required
                maxLength={120}
                defaultValue={current?.type}
                placeholder="e.g. Protective masks"
              />
            </label>
            <label>
              Quantity
              <input
                name="quantity"
                type="number"
                min={0}
                max={2147483647}
                step={1}
                required
                defaultValue={current?.quantity ?? 0}
              />
            </label>
            <label>
              Assigned location
              <select name="location_id" defaultValue={current?.location_id ?? ''}>
                <option value="">Unassigned</option>
                {locations.data?.map((l) => (
                  <option
                    value={l.id}
                    key={l.id}
                    disabled={Boolean(l.archived_at && l.id !== current?.location_id)}
                  >
                    {l.name}
                    {l.archived_at ? ' (archived)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Allocation date
              <input
                name="allocated_date"
                type="date"
                defaultValue={current?.allocated_date || ''}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Save resource
            </button>
          </form>
        </Dialog>
      )}
      {remove && (
        <Dialog
          title="Delete resource?"
          close={() => {
            if (!busy) setRemove(null)
          }}
        >
          <p>
            Remove the inventory entry for {remove.type} ({remove.quantity} units)?
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="danger" disabled={busy} onClick={() => void deleteResource()}>
            Delete resource
          </button>
        </Dialog>
      )}
    </>
  )
}
