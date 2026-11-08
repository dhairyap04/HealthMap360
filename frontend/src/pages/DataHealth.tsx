import { useApi } from '../lib/useApi'
import LoadState from '../components/LoadState'
export default function DataHealth() {
  const health = useApi<{
    conflicts: number
    note: string
    series: {
      location: string
      disease: string
      source: string | null
      provenance: string
      latest_report: string
      historical: boolean
      observations: number
    }[]
  }>('/data-health')
  return (
    <>
      <p className="eyebrow">SOURCE QUALITY</p>
      <h1>Data health</h1>
      <LoadState loading={health.loading} error={health.error} retry={health.reload} />
      {health.data && (
        <>
          <p className="notice">{health.data.note}</p>
          <p>
            {health.data.conflicts} observations require conflict review and are excluded from
            totals.
          </p>
          <section className="panel table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reporting area</th>
                  <th>Disease</th>
                  <th>Source</th>
                  <th>Provenance</th>
                  <th>Latest report</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {health.data.series.map((row, i) => (
                  <tr key={i}>
                    <td>{row.location}</td>
                    <td>{row.disease}</td>
                    <td>{row.source || 'Unspecified'}</td>
                    <td>{row.provenance}</td>
                    <td>{row.latest_report}</td>
                    <td>
                      {row.historical ? 'Historical · over 30 days' : 'Recent report'} ·{' '}
                      {row.observations} observations; completeness not inferred
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  )
}
