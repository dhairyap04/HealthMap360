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
      <div className="review-shortcut">
        <span>
          <span className="eyebrow">YOUR NEXT REVIEW</span>
          <strong>Turn this week's evidence into a clear next step.</strong>
        </span>
        <Link className="button" to="/review">
          Open weekly review <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <MonitoringStrip />
      <Filters value={filters} onChange={setFilters} />
      <LoadState loading={loading} error={error} retry={reload} />
      {data && (
        <>
          {data.excluded_for_review > 0 && (
            <p className="notice">
              {data.excluded_for_review} conflicting observations excluded from totals. Review them
              in Reports & data.
            </p>
          )}
          {data.view.historical && (
            <p className="notice">
              Historical source: the latest available report is {data.view.latest_report_date}.
              These counts describe the selected reporting period.
            </p>
          )}
          <div className="stats-grid">
            {[
              [
                'Reported cases',
                data.observations ? data.total_cases : '—',
                'Sum within selected filters',
              ],
              ['Affected locations', data.affected_locations, 'Locations with observations'],
              ['Diseases tracked', data.diseases, 'Distinct diseases in view'],
            ].map(([label, value, note], index) => (
              <section className="stat" key={label}>
                <span className="stat-index" aria-hidden="true">
                  0{index + 1}
                </span>
                <p>{label}</p>
                <strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong>
                <small>{note}</small>
              </section>
            ))}
          </div>
          <ReportingContext view={data.view} />
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
                    <LineChart data={data.trend} accessibilityLayer>
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
                  <details className="chart-data">
                    <summary>View trend as a table</summary>
                    <div
                      className="table-scroll"
                      tabIndex={0}
                      role="region"
                      aria-label="Trend data"
                    >
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Report date</th>
                            <th scope="col">Reported cases</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.trend.map((row) => (
                            <tr key={row.date}>
                              <th scope="row">{row.date}</th>
                              <td>{row.cases.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <small className="muted">
                    Only dates with reports appear. Missing dates do not imply zero cases.
                  </small>
                </section>
                <section className="panel">
                  <h2>Cases by disease</h2>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.by_disease} accessibilityLayer>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="disease" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} width={40} />
                      <Tooltip />
                      <Bar
                        isAnimationActive={false}
                        dataKey="cases"
                        fill="#247b78"
                        radius={[5, 5, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  <details className="chart-data">
                    <summary>View disease breakdown as a table</summary>
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Disease</th>
                          <th scope="col">Reported cases</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_disease.map((row) => (
                          <tr key={row.disease}>
                            <th scope="row">{row.disease}</th>
                            <td>{row.cases.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Locations at a glance</h2>
                  <Link to="/map">Explore map →</Link>
                </div>
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Reported cases by location"
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Location</th>
                        <th scope="col">Reported cases</th>
                        <th scope="col">Highest reviewed assessment</th>
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
