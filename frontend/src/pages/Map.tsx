import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import Filters from '../components/Filters'
import LoadState from '../components/LoadState'
import { query } from '../lib/api'
import { emptyFilters } from '../lib/types'
import type { Summary } from '../lib/types'
import { useApi } from '../lib/useApi'

const colors = { low: '#2b8a69', medium: '#b67b15', high: '#dc6b2c', critical: '#c14357' }
function FitLocations({ locations }: { locations: Summary['locations'] }) {
  const map = useMap()
  useEffect(() => {
    if (locations.length)
      map.fitBounds(
        locations.map((l) => [l.latitude, l.longitude] as [number, number]),
        { padding: [45, 45], maxZoom: 10 },
      )
  }, [locations, map])
  return null
}
export default function MapPage() {
  const [filters, setFilters] = useState({ ...emptyFilters })
  const { data, error, loading, reload } = useApi<Summary>(`/summary${query(filters)}`)
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">GEOGRAPHIC INTELLIGENCE</p>
          <h1>Outbreak map</h1>
          <p className="muted">Explore reported cases by location and severity.</p>
        </div>
      </div>
      <Filters value={filters} onChange={setFilters} />
      <LoadState loading={loading} error={error} retry={reload} />
      {data && (
        <>
          <div className="map-layout">
            <section className="panel map-panel">
              <MapContainer
                center={[53.5, -113.5]}
                zoom={5}
                className="outbreak-map"
                aria-label="Outbreak locations"
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <FitLocations locations={data.locations} />
                {data.locations.map((l) => (
                  <CircleMarker
                    key={l.id}
                    center={[l.latitude, l.longitude]}
                    radius={Math.min(30, 7 + Math.sqrt(l.cases))}
                    pathOptions={{ color: colors[l.severity], fillOpacity: 0.65 }}
                  >
                    <Popup>
                      <strong>{l.name}</strong>
                      <p>
                        {l.cases.toLocaleString()} reported cases
                        <br />
                        Highest severity: {l.severity}
                      </p>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </section>
            <aside className="panel">
              <h2>{data.affected_locations} affected locations</h2>
              <p className="muted">
                Marker size reflects case count. Color shows highest severity within the selected
                records.
              </p>
              {data.locations.length === 0 && (
                <p className="empty">No observations match your filters.</p>
              )}
              <div className="location-list">
                {data.locations.map((l) => (
                  <div key={l.id}>
                    <span>
                      <strong>{l.name}</strong>
                      <small>
                        <span className={`badge ${l.severity}`}>{l.severity}</span>
                      </small>
                    </span>
                    <strong>{l.cases.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
              <div className="legend">
                {Object.keys(colors).map((s) => (
                  <span key={s} className={`badge ${s}`}>
                    {s}
                  </span>
                ))}
              </div>
            </aside>
          </div>
          <p className="muted">
            Map tiles require internet access. The location list remains available without tiles.
          </p>
        </>
      )}
    </>
  )
}
