import { useSearchParams } from 'react-router-dom'
import { emptyFilters } from './types'
import type { Filters, GeographicScope } from './types'

export const reportingDefaults: Filters = {
  ...emptyFilters,
  geographic_scope: 'local',
  time_window: 'last28',
}
export function useReportingFilters(surveillance = true): [Filters, (next: Filters) => void] {
  const [params, setParams] = useSearchParams()
  const base = surveillance ? reportingDefaults : emptyFilters
  const filters: Filters = { ...base }
  for (const key of ['date_from', 'date_to', 'disease', 'severity', 'location_id'] as const)
    filters[key] = params.get(key) || ''
  const scope = params.get('geographic_scope')
  if (['local', 'regional', 'national'].includes(scope || ''))
    filters.geographic_scope = scope as GeographicScope
  const window = params.get('time_window')
  if (['last28', 'latest', 'historical'].includes(window || ''))
    filters.time_window = window as Filters['time_window']
  return [
    filters,
    (next) =>
      setParams(
        Object.fromEntries(
          Object.entries(next).filter(([, value]) => value !== '' && value != null),
        ),
      ),
  ]
}
