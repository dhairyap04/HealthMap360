import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import Filters from '../components/Filters'
import LoadState from '../components/LoadState'
import { query } from '../lib/api'
import { emptyFilters } from '../lib/types'
import type { Location, Summary } from '../lib/types'
import { useApi } from '../lib/useApi'

const colors = { low: '#2b8a69', medium: '#b67b15', high: '#dc6b2c', critical: '#c14357' }
function FitLocations({ locations }: { locations: Pick<Location, 'latitude' | 'longitude'>[] }) {
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
  const reports = useApi<Summary>(`/summary${query(filters)}`)
  const saved = useApi<Location[]>('/locations')
  const locations = useMemo(() => {
    const observations = new Map(reports.data?.locations.map((location) => [location.id, location]))
    return (saved.data || [])
      .filter((location) => !filters.location_id || String(location.id) === filters.location_id)
      .map((location) => ({ ...location, report: observations.get(location.id) }))
  }, [reports.data, saved.data, filters.location_id])
  const loading = reports.loading || saved.loading
  const error = reports.error || saved.error
  const hasReportFilters = Boolean(
    filters.date_from || filters.date_to || filters.disease || filters.severity,
  )
  const noReportsLabel = hasReportFilters ? 'No reports in view' : 'No reports yet'
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">GEOGRAPHIC INTELLIGENCE</p>
          <h1>Outbreak map</h1>
          <p className="muted">Explore saved locations and their reported cases.</p>
        </div>
      </div>
      <Filters value={filters} onChange={setFilters} />
      <LoadState
        loading={loading}
        error={error}
        retry={() => {
          reports.reload()
          saved.reload()
        }}
      />
      {!loading && !error && reports.data && saved.data && (
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
                <FitLocations locations={locations} />
                {locations.map((location) => (
                  <CircleMarker
                    key={location.id}
                    center={[location.latitude, location.longitude]}
                    radius={
                      location.report ? Math.min(30, 7 + Math.sqrt(location.report.cases)) : 8
                    }
                    pathOptions={
                      location.report
                        ? { color: colors[location.report.severity], fillOpacity: 0.65 }
                        : {
                            color: '#839b90',
                            fillColor: '#fff',
                            fillOpacity: 0.95,
                            weight: 2,
                            dashArray: '3 3',
                          }
                    }
                  >
                    <Popup>
                      <strong>{location.name}</strong>
                      {location.report ? (
                        <p>
                          {location.report.cases.toLocaleString()} reported cases
                          <br />
                          Highest severity: {location.report.severity}
                        </p>
                      ) : (
                        <p>
                          {hasReportFilters
                            ? 'No reports match the current filters.'
                            : 'No outbreak reports have been added for this location yet.'}
                        </p>
                      )}
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </section>
            <aside className="panel">
              <h2>
                {locations.length} saved {locations.length === 1 ? 'location' : 'locations'}
              </h2>
              <p className="muted">{reports.data.affected_locations} with reports in this view.</p>
              <p className="muted">
                Marker size reflects case count. Color shows highest reported severity. Dashed
                markers show saved places without reports in this view.
              </p>
              {locations.length === 0 && (
                <p className="empty">
                  No saved locations in this view. Add a place in Settings to see it here.
                </p>
              )}
              <div className="location-list">
                {locations.map((location) => (
                  <div key={location.id}>
                    <span>
                      <strong>{location.name}</strong>
                      <small>
                        <span className={`badge ${location.report?.severity || 'unreported'}`}>
                          {location.report?.severity || noReportsLabel}
                        </span>
                      </small>
                    </span>
                    <strong aria-label={location.report ? undefined : noReportsLabel}>
                      {location.report ? location.report.cases.toLocaleString() : '—'}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="legend">
                {Object.keys(colors).map((severity) => (
                  <span key={severity} className={`badge ${severity}`}>
                    {severity}
                  </span>
                ))}
                <span className="badge unreported">No reports in view</span>
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
