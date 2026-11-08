import { useEffect, useState } from 'react'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { geoJSON } from 'leaflet'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PublishedReport } from '../pages/PublicPortal'
type Boundary = Feature<Geometry, { code: string }>
function FitBoundary({ boundary }: { boundary: Boundary }) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize({ animate: false })
    map.fitBounds(geoJSON(boundary).getBounds(), { padding: [20, 20], animate: false })
  }, [boundary, map])
  return null
}
export default function PublishedEvidence({ report }: { report: PublishedReport }) {
  const [boundary, setBoundary] = useState<Boundary | null>(null)
  const [state, setState] = useState('Loading reporting outline…')
  const regional = report.location.geographic_scope === 'regional'
  const local = report.location.geographic_scope === 'local'
  const code = regional ? report.location.region_code : report.location.country_code
  useEffect(() => {
    if (local || !code) return
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}geography/${regional ? 'regions' : 'countries'}.geojson`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error()
        return response.json() as Promise<FeatureCollection<Geometry, Boundary['properties']>>
      })
      .then((data) => {
        const feature = data.features.find((feature) => feature.properties.code === code)
        if (feature) setBoundary(feature)
        else setState('Reporting outline is unavailable. The report remains available below.')
      })
      .catch((error) => {
        if (error.name !== 'AbortError')
          setState('Reporting outline could not be loaded. The report remains available below.')
      })
    return () => controller.abort()
  }, [code, local, regional])
  return (
    <section aria-label="Published reporting evidence">
      <h3>Reporting area and timeline</h3>
      {boundary ? (
        <>
          <MapContainer
            className="public-map"
            center={[50, -100]}
            zoom={3}
            zoomAnimation={false}
            fadeAnimation={false}
            aria-label="Published reporting area"
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors · Natural Earth"
            />
            <GeoJSON data={boundary} style={{ color: '#387e8c', fillOpacity: 0.15, weight: 2 }} />
            <FitBoundary boundary={boundary} />
          </MapContainer>
          <small className="muted">
            Generalized reporting outline, not a risk score or authoritative health catchment.
          </small>
        </>
      ) : (
        <p className="muted">
          {local || !code
            ? 'A public outline is unavailable for this reporting area. Exact location coordinates remain private.'
            : state}
        </p>
      )}
      <h3>Reported counts by report date</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={report.reports}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis width={65} />
          <Tooltip />
          <Line
            dataKey="cases"
            stroke="#087f78"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="muted">
        Daily and weekly periods are attributed to their report-ending dates. Missing dates and
        withheld values do not mean zero. The reporting table provides the same values in text.
      </p>
    </section>
  )
}
