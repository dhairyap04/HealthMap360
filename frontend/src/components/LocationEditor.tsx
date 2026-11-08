import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet'
import { api, errorMessage, query } from '../lib/api'
import type { Location, PlaceResult } from '../lib/types'

type Selection = Pick<
  PlaceResult,
  | 'name'
  | 'label'
  | 'latitude'
  | 'longitude'
  | 'administrative_level'
  | 'country_code'
  | 'region_code'
>
export default function LocationEditor({
  location,
  onSaved,
  onBusyChange,
}: {
  location: Location | null
  onSaved: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  const [selected, setSelected] = useState<Selection | null>(
    location
      ? {
          ...location,
          label: location.name,
          administrative_level: location.administrative_level || '',
        }
      : null,
  )
  const [name, setName] = useState(location?.name || '')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searchError, setSearchError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => () => controller.current?.abort(), [])

  async function findPlaces() {
    if (search.trim().length < 3) {
      setSearchError('Enter at least 3 characters, such as a city and country.')
      searchInput.current?.focus()
      return
    }
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setSearching(true)
    setSearchError('')
    setResults(null)
    try {
      const response = await api<{ results: PlaceResult[] }>(
        `/locations/search${query({ q: search.trim() })}`,
        { signal: request.signal },
      )
      if (!request.signal.aborted) setResults(response.results)
    } catch (error) {
      if (!request.signal.aborted) setSearchError(errorMessage(error))
    } finally {
      if (!request.signal.aborted) setSearching(false)
    }
  }
  function choose(place: PlaceResult) {
    controller.current?.abort()
    setSearching(false)
    setSelected(place)
    setName(place.name)
    setSearch('')
    setResults(null)
    setError('')
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) {
      setError('Search for a place and choose the correct result before saving.')
      return
    }
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    const body = {
      name: name.trim(),
      latitude: selected.latitude,
      longitude: selected.longitude,
      country_code: selected.country_code || null,
      region_code: fields.region_code || selected.region_code || null,
      population: fields.population ? Number(fields.population) : null,
      administrative_level:
        fields.geographic_scope === 'national'
          ? 'country'
          : fields.geographic_scope === 'regional'
            ? 'state'
            : 'city',
    }
    setSaving(true)
    onBusyChange(true)
    setError('')
    try {
      await api(location ? `/locations/${location.id}` : '/locations', {
        method: location ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      })
      onSaved()
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setSaving(false)
      onBusyChange(false)
    }
  }
  return (
    <form className="form-stack location-editor" onSubmit={save}>
      <p className="muted">
        Find a city, region or address, then choose the right place. We’ll fill in its map position
        for you.
      </p>
      <div className="place-search">
        <label htmlFor="place-search">Search for a place</label>
        <div className="place-search-row">
          <div className="place-search-input">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="m16 16 4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            <input
              ref={searchInput}
              id="place-search"
              type="search"
              autoComplete="off"
              placeholder="e.g. Lethbridge, Alberta, Canada"
              maxLength={200}
              value={search}
              disabled={saving}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void findPlaces()
                }
              }}
              onChange={(e) => {
                controller.current?.abort()
                setSearching(false)
                setSearch(e.target.value)
                setResults(null)
                setSearchError('')
              }}
            />
          </div>
          <button
            type="button"
            disabled={saving || searching || search.trim().length < 3}
            onClick={() => void findPlaces()}
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        <small className="muted">
          Add a region or country to distinguish places with the same name.
        </small>
      </div>
      {searchError && (
        <div className="error" role="alert">
          {searchError}
          <button
            type="button"
            className="text-button"
            onClick={() => void findPlaces()}
            disabled={searching || saving}
          >
            Try again
          </button>
        </div>
      )}
      {searching && (
        <p className="muted" role="status">
          Finding matching places…
        </p>
      )}
      {results &&
        (results.length ? (
          <div className="place-results" aria-label="Matching places">
            <p className="eyebrow">CHOOSE A PLACE</p>
            {results.map((place) => (
              <button
                type="button"
                key={place.id}
                className="place-result"
                onClick={() => choose(place)}
              >
                <span className="place-result-icon" aria-hidden="true">
                  ◎
                </span>
                <span>
                  <strong>{place.name}</strong>
                  <small>{place.label}</small>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="place-empty" role="status">
            <strong>No matching places found</strong>
            <p>Try a nearby city, a more specific address, or include the country.</p>
          </div>
        ))}
      {selected && (
        <section className="selected-place" aria-label="Selected place">
          <div className="selected-place-heading">
            <span className="selected-place-check" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>{selected.name}</strong>
              <p>{selected.label}</p>
            </div>
            <button
              type="button"
              className="text-button"
              disabled={saving}
              onClick={() => {
                setSelected(null)
                setName('')
                setResults(null)
                searchInput.current?.focus()
              }}
            >
              Change
            </button>
          </div>
          <MapContainer
            key={`${selected.latitude}:${selected.longitude}`}
            center={[selected.latitude, selected.longitude]}
            zoom={10}
            className="place-map"
            scrollWheelZoom={false}
            dragging={false}
            zoomControl={false}
            doubleClickZoom={false}
            touchZoom={false}
            keyboard={false}
            attributionControl={true}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <CircleMarker
              center={[selected.latitude, selected.longitude]}
              radius={9}
              pathOptions={{ color: '#087f78', fillColor: '#087f78', fillOpacity: 0.8 }}
            />
          </MapContainer>
          <p className="place-confirmation">
            Map position filled automatically. Check the place above before saving.
          </p>
        </section>
      )}
      <p className="place-attribution">
        Place search by Nominatim ·{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap contributors
        </a>
      </p>
      {selected && (
        <>
          <label>
            Display name
            <input
              name="name"
              value={name}
              maxLength={200}
              required
              disabled={saving}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Reporting geography
            <select
              name="geographic_scope"
              key={`${selected.latitude}:${selected.longitude}`}
              defaultValue={
                location?.geographic_scope === 'unclassified'
                  ? ''
                  : location?.geographic_scope ||
                    (selected.administrative_level.toLowerCase() === 'country'
                      ? 'national'
                      : ['state', 'province', 'region', 'territory'].includes(
                            selected.administrative_level.toLowerCase(),
                          )
                        ? 'regional'
                        : 'local')
              }
              required
              disabled={saving}
            >
              <option value="">Choose reporting geography…</option>
              <option value="local">Local · city or site</option>
              <option value="regional">Regional · province or state</option>
              <option value="national">National · country</option>
            </select>
          </label>
          <p className="muted">
            Reports for this place appear only in the selected geography view.
          </p>
          <details className="place-details">
            <summary>Optional details</summary>
            <div className="form-stack">
              <label>
                Population
                <input
                  name="population"
                  type="number"
                  step={1}
                  min={0}
                  max={2147483647}
                  defaultValue={location?.population ?? ''}
                  disabled={saving}
                />
              </label>
              <label>
                Region identifier (for province or state outlines)
                <input
                  name="region_code"
                  pattern="[A-Z]{2}-[A-Z0-9]{1,3}"
                  maxLength={6}
                  defaultValue={selected.region_code || ''}
                  placeholder="e.g. CA-AB"
                  disabled={saving}
                />
                <small className="muted">
                  Filled automatically when available from place search.
                </small>
              </label>
            </div>
          </details>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary"
        disabled={!selected || saving || searching || Boolean(search.trim())}
      >
        {saving ? 'Saving…' : 'Save location'}
      </button>
    </form>
  )
}
