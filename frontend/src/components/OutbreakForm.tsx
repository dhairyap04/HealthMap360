import { useWorkspaceDate } from '../lib/workspaceDate'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/context'
import { api, errorMessage } from '../lib/api'
import type { Outbreak } from '../lib/surveillance'
import type { Location } from '../lib/types'
import { useApi } from '../lib/useApi'
import LoadState from './LoadState'
export default function OutbreakForm({
  outbreak,
  saved,
}: {
  outbreak?: Outbreak
  saved: (id: number) => void
}) {
  const today = useWorkspaceDate()
  const { user } = useAuth()
  const locations = useApi<Location[]>('/locations')
  const owners = useApi<{ id: number; username: string }[]>('/outbreaks/owners')
  const [status, setStatus] = useState(outbreak?.status || 'investigating')
  const [ownerId, setOwnerId] = useState(String(outbreak?.owner_id || user?.id || ''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = {
      ...Object.fromEntries(form),
      owner_id: Number(form.get('owner_id')),
      location_ids: form.getAll('location_ids').map(Number),
      ended_on: form.get('ended_on') || null,
    }
    setBusy(true)
    setError('')
    try {
      const result = await api<Outbreak>(outbreak ? `/outbreaks/${outbreak.id}` : '/outbreaks', {
        method: outbreak ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      })
      saved(result.id)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <label>
        Investigation title
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={outbreak?.title}
          placeholder="e.g. Influenza response · Edmonton"
        />
      </label>
      <label>
        Disease
        <input
          name="disease"
          required
          maxLength={120}
          defaultValue={outbreak?.disease}
          placeholder="e.g. influenza"
        />
      </label>
      <div className="form-columns">
        <label>
          Status
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {['investigating', 'active', 'contained', 'closed'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Response priority
          <select name="priority" defaultValue={outbreak?.priority || 'medium'}>
            {['low', 'medium', 'high', 'critical'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-columns">
        <label>
          Start date
          <input
            name="started_on"
            type="date"
            required
            key={today}
            defaultValue={outbreak?.started_on || today}
          />
        </label>
        <label>
          End date
          <input
            name="ended_on"
            type="date"
            required={status === 'closed'}
            defaultValue={outbreak?.ended_on || ''}
          />
        </label>
      </div>
      <label>
        Investigation owner
        <select name="owner_id" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          {owners.data?.map((owner) => (
            <option value={owner.id} key={owner.id}>
              {owner.username}
            </option>
          ))}
        </select>
      </label>
      <LoadState
        loading={locations.loading || owners.loading}
        error={locations.error || owners.error}
      />
      <fieldset className="location-choices">
        <legend>Tracked locations · choose at least one</legend>
        {locations.data?.map((location) => (
          <label className="check-option" key={location.id}>
            <input
              type="checkbox"
              name="location_ids"
              value={location.id}
              defaultChecked={outbreak?.locations.some((l) => l.id === location.id)}
            />
            {location.name}
          </label>
        ))}
        {locations.data?.length === 0 && <p className="muted">Add locations in Settings first.</p>}
      </fieldset>
      <label>
        Situation summary
        <textarea
          name="description"
          rows={4}
          maxLength={10000}
          defaultValue={outbreak?.description}
          placeholder="Scope, response priorities and context…"
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        className="primary"
        disabled={
          busy || locations.loading || owners.loading || Boolean(locations.error || owners.error)
        }
      >
        {busy ? 'Saving…' : 'Save investigation'}
      </button>
    </form>
  )
}
