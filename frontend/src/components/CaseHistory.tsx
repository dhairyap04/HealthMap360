import type { Observation } from '../lib/types'
import { dateTime } from '../lib/surveillance'
import { useApi } from '../lib/useApi'
import LoadState from './LoadState'

type Snapshot = {
  case_count: number
  source: string | null
  reporting_period_days: number
  outbreak_id: number | null
}
type Revision = {
  id: number
  action: string
  before: Snapshot | null
  after: Snapshot | null
  feed_id: number | null
  user_id: number | null
  created_at: string
}
export default function CaseHistory({ observation }: { observation: Observation }) {
  const history = useApi<Revision[]>(`/cases/${observation.id}/history`)
  return (
    <>
      <p className="muted">
        {observation.location.name} · {observation.disease} · {observation.date}
      </p>
      <LoadState loading={history.loading} error={history.error} retry={history.reload} />
      {history.data &&
        (history.data.length ? (
          <div className="activity-list">
            {history.data.map((change) => (
              <article key={change.id}>
                <div>
                  <strong>{change.action.replaceAll('_', ' ')}</strong>
                  <time>{dateTime(change.created_at)}</time>
                  <span className="status-pill">
                    {change.feed_id ? 'Source feed' : 'Analyst action'}
                  </span>
                </div>
                <p>
                  {change.before?.case_count.toLocaleString() ?? '—'} →{' '}
                  {change.after?.case_count.toLocaleString() ?? 'Removed'} reported cases
                </p>
                {change.after && (
                  <p className="muted">
                    {change.after.reporting_period_days === 7 ? 'Weekly' : 'Daily'} report ·{' '}
                    {change.after.source || 'No source specified'}
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">
            No recorded changes. This observation predates the audit history feature.
          </p>
        ))}
    </>
  )
}
