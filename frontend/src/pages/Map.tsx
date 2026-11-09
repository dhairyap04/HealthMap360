import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { geoJSON } from 'leaflet'
import type { Outbreak } from '../lib/surveillance'
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import Filters from '../components/Filters'
import ReportingContext from '../components/ReportingContext'
import LoadState from '../components/LoadState'
import { query } from '../lib/api'
import { useReportingFilters } from '../lib/reporting'
import type { Location, Summary } from '../lib/types'
import { useApi } from '../lib/useApi'

const colors = {
  unassessed: '#667b86',
  low: '#2b8a69',
  medium: '#b67b15',
  high: '#dc6b2c',
  critical: '#c14357',
}
type Boundary = Feature<Geometry, { code: string; country_code: string; name: string }>
function FitLocations({
  locations,
  boundaries,
}: {
  locations: Location[]
  boundaries: Boundary[]
}) {
  const map = useMap()
  useEffect(() => {
    if (boundaries.length) {
      const bounds = geoJSON({
        type: 'FeatureCollection',
        features: boundaries,
      } as FeatureCollection).getBounds()
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [25, 25], maxZoom: 7, animate: false })
    } else if (locations.length) {
      map.fitBounds(
        locations.map((l) => [l.latitude, l.longitude] as [number, number]),
        { padding: [45, 45], maxZoom: 10, animate: false },
      )
    } else map.setView([45, -95], 3, { animate: false })
  }, [locations, boundaries, map])
  return null
}
export default function MapPage() {
  const [filters, setFilters] = useReportingFilters()
  const scope = filters.geographic_scope || 'local'
  const reports = useApi<Summary>(`/summary${query(filters)}`)
  const saved = useApi<Location[]>('/locations')
  const investigations = useApi<Outbreak[]>('/outbreaks')
  const [boundaryData, setBoundaryData] = useState<{
    scope: string
    features: Boundary[]
    error?: string
  } | null>(null)
  useEffect(() => {
    if (scope === 'local') return
    const controller = new AbortController()
    fetch(
      `${import.meta.env.BASE_URL}geography/${scope === 'national' ? 'countries' : 'regions'}.geojson`,
      {
        signal: controller.signal,
      },
    )
      .then((response) => {
        if (!response.ok) throw new Error('Boundary download failed')
        return response.json() as Promise<FeatureCollection<Geometry, Boundary['properties']>>
      })
      .then((data) => setBoundaryData({ scope, features: data.features }))
      .catch((error) => {
        if (error.name !== 'AbortError')
          setBoundaryData({
            scope,
            features: [],
            error: 'Boundaries could not be loaded. Reports remain available in the list.',
          })
      })
    return () => controller.abort()
  }, [scope])
  const locations = useMemo(() => {
    const observations = new Map(reports.data?.locations.map((location) => [location.id, location]))
    return (saved.data || [])
      .filter(
        (location) =>
          location.geographic_scope === scope &&
          (!filters.location_id || String(location.id) === filters.location_id),
      )
      .map((location) => ({
        ...location,
        report: observations.get(location.id),
        investigations: (investigations.data || []).filter(
          (outbreak) =>
            outbreak.status !== 'closed' &&
            outbreak.locations.some((l) => l.id === location.id) &&
            (!filters.disease || outbreak.disease === filters.disease),
        ),
        boundary:
          boundaryData?.scope === scope
            ? boundaryData.features.find((feature) =>
                scope === 'national'
                  ? location.country_code
                    ? feature.properties.code === location.country_code
                    : feature.properties.name.toLowerCase() === location.name.toLowerCase()
                  : Boolean(
                      location.region_code && feature.properties.code === location.region_code,
                    ),
              )
            : undefined,
      }))
  }, [
    saved.data,
    reports.data,
    investigations.data,
    scope,
    filters.location_id,
    filters.disease,
    boundaryData,
  ])
  const boundaries = useMemo(
    () => locations.flatMap((l) => (l.boundary ? [l.boundary] : [])),
    [locations],
  )
  const points = useMemo(() => (scope === 'local' ? locations : []), [scope, locations])
  const loading = reports.loading || saved.loading
  const error = reports.error || saved.error
  const popup = (location: (typeof locations)[number]) => (
    <Popup>
      <strong>{location.name}</strong>
      <p>{scope[0].toUpperCase() + scope.slice(1)} reporting area</p>
      {location.report ? (
        <p>
          {location.report.cases.toLocaleString()} reported cases
          <br />
          Reports: {location.report.first_report} → {location.report.latest_report}
          <br />
          Reviewed assessment: {location.report.severity}
        </p>
      ) : (
        <p>No reports in this view. This does not mean zero cases.</p>
      )}
      {location.investigations.length > 0 && (
        <div className="map-investigations">
          <strong>Open investigations</strong>
          {location.investigations.map((outbreak) => (
            <Link key={outbreak.id} to={`/outbreaks/${outbreak.id}`}>
              {outbreak.title} →
            </Link>
          ))}
        </div>
      )}
    </Popup>
  )
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">GEOGRAPHIC INTELLIGENCE</p>
          <h1>Outbreak map</h1>
          <p className="muted">
            Explore reports at the geography and reporting period they describe.
          </p>
        </div>
      </div>
      <Filters value={filters} onChange={setFilters} />
      {investigations.error && (
        <p className="muted">
          Investigation details could not be loaded. Reports remain available.
        </p>
      )}
      <LoadState
        loading={loading}
        error={error}
        retry={() => {
          reports.reload()
          saved.reload()
          investigations.reload()
        }}
      />
      {!loading && !error && reports.data && saved.data && (
        <>
          <ReportingContext view={reports.data.view} />
          <div className="map-layout">
            <section className="panel map-panel">
              <MapContainer
                center={[53.5, -113.5]}
                zoom={5}
                className="outbreak-map"
                aria-label="Outbreak locations"
                zoomAnimation={false}
                fadeAnimation={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://www.naturalearthdata.com/">Natural Earth</a>'
                />
                <FitLocations locations={points} boundaries={boundaries} />
                {scope === 'local'
                  ? locations.map((location) => (
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
                        {popup(location)}
                      </CircleMarker>
                    ))
                  : locations.map(
                      (location) =>
                        location.boundary && (
                          <GeoJSON
                            key={`${scope}-${location.id}`}
                            data={location.boundary}
                            style={{
                              color: '#387e8c',
                              fillColor: '#79a9b0',
                              weight: 2,
                              fillOpacity: location.report ? 0.22 : 0.06,
                              dashArray: location.report ? undefined : '4 4',
                            }}
                          >
                            {popup(location)}
                          </GeoJSON>
                        ),
                    )}
              </MapContainer>
            </section>
            <aside className="panel" aria-label="Reporting areas">
              <p className="eyebrow">{scope.toUpperCase()} VIEW</p>
              <h2>
                {locations.length} saved {locations.length === 1 ? 'location' : 'locations'}
              </h2>
              <div className="map-total">
                <strong>
                  {reports.data.observations ? reports.data.total_cases.toLocaleString() : '—'}
                </strong>
                <span>reported cases in this view</span>
              </div>
              <p className="muted">
                {reports.data.affected_locations} with reports.{' '}
                {scope === 'local'
                  ? 'Marker size reflects reported count; color shows the highest reviewed assessment.'
                  : 'Outlines show reporting areas. Shading identifies available reports, without assigning risk from raw counts.'}
              </p>
              {scope !== 'local' && boundaryData?.scope !== scope && (
                <p role="status">Loading boundaries…</p>
              )}
              {boundaryData?.scope === scope && boundaryData.error && (
                <p className="notice">{boundaryData.error}</p>
              )}
              {scope !== 'local' &&
                boundaryData?.scope === scope &&
                locations.some((l) => !l.boundary) && (
                  <p className="notice">
                    Some boundaries are unavailable. Check country or region identifiers in
                    Settings; their reports remain listed below.
                  </p>
                )}
              {locations.length === 0 && (
                <p className="empty">
                  No saved {scope} locations. Add a place in Settings to see it here.
                </p>
              )}
              <div className="location-list">
                {locations.map((location) => (
                  <div key={location.id}>
                    <span>
                      <strong>{location.name}</strong>
                      {location.investigations.length > 0 && (
                        <small>{location.investigations.length} open investigation(s)</small>
                      )}
                      <small>
                        <span className={`badge ${location.report?.severity || 'unreported'}`}>
                          {location.report?.severity || 'No reports in view'}
                        </span>
                      </small>
                      {location.report && (
                        <small>Latest report · {location.report.latest_report}</small>
                      )}
                    </span>
                    <strong aria-label={location.report ? undefined : 'No reports in view'}>
                      {location.report ? location.report.cases.toLocaleString() : '—'}
                    </strong>
                  </div>
                ))}
              </div>
              <Link
                className="button"
                to={`/reports${query({ geographic_scope: scope, location_id: filters.location_id, disease: filters.disease, severity: filters.severity, date_from: reports.data.view.date_from, date_to: reports.data.view.date_to })}`}
              >
                Review reports →
              </Link>
            </aside>
          </div>
          <p className="muted">
            Unassessed means no analyst assessment has been recorded. Set response priority in an
            investigation after reviewing the evidence. Map tiles require internet; boundaries and
            report lists are bundled with the app.
          </p>
        </>
      )}
    </>
  )
}
