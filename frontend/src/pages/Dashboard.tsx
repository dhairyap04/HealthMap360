import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from 'recharts'
import Filters from '../components/Filters'
import MonitoringStrip from '../components/MonitoringStrip'
import LoadState from '../components/LoadState'
import { query } from '../lib/api'
import { useReportingFilters } from '../lib/reporting'
import ReportingContext from '../components/ReportingContext'
import type { Summary } from '../lib/types'
import { useApi } from '../lib/useApi'

export default function Dashboard() {
  const [filters, setFilters] = useReportingFilters()
  const { data, loading, error, reload } = useApi<Summary>(`/summary${query(filters)}`)
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SITUATION OVERVIEW</p>
          <h1>Public health, in focus.</h1>
          <p className="muted">Monitor reported cases and coordinate your response.</p>
        </div>
        <Link className="button primary" to="/reports">
          View reports ↗
        </Link>
      </div>
      <MonitoringStrip />
      <Filters value={filters} onChange={setFilters} />
      <LoadState loading={loading} error={error} retry={reload} />
      {data && (
        <>
          <ReportingContext view={data.view} />
          <div className="stats-grid">
            {[
              [
                'Reported cases',
                data.observations ? data.total_cases : '—',
                'Sum within selected filters',
              ],
              ['Affected locations', data.affected_locations, 'Locations with observations'],
              ['Diseases tracked', data.diseases, 'Distinct diseases in view'],
              ['Resource units', data.resource_units, 'Current stock in selected geography'],
            ].map(([label, value, note]) => (
              <section className="stat" key={label}>
                <p>{label}</p>
                <strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong>
                <small>{note}</small>
              </section>
            ))}
          </div>
          {data.observations === 0 ? (
            <div className="panel empty">
              <h2>No observations in this view</h2>
              <p>Adjust your filters or import a CSV to begin.</p>
              <Link className="button" to="/reports">
                Go to reports
              </Link>
            </div>
          ) : (
            <>
              <div className="chart-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Reported cases over time</h2>
                    <span className="muted">{data.observations.toLocaleString()} observations</span>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={data.trend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} width={45} />
                      <Tooltip />
                      <Line
                        isAnimationActive={false}
                        type="linear"
                        dataKey="cases"
                        stroke="#087f78"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <small className="muted">
                    Only dates with reports appear. Missing dates do not imply zero cases.
                  </small>
                </section>
                <section className="panel">
                  <h2>Cases by disease</h2>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.by_disease}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="disease" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} width={40} />
                      <Tooltip />
                      <Bar
                        isAnimationActive={false}
                        dataKey="cases"
                        fill="#41a99c"
                        radius={[5, 5, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Locations at a glance</h2>
                  <Link to="/map">Explore map →</Link>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Location</th>
                        <th>Reported cases</th>
                        <th>Highest reviewed assessment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.locations.map((l) => (
                        <tr key={l.id}>
                          <td>{l.name}</td>
                          <td>{l.cases.toLocaleString()}</td>
                          <td>
                            <span className={`badge ${l.severity}`}>{l.severity}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </>
  )
}
