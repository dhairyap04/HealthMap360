import type { Filters as FilterValues, Location } from '../lib/types'
import { emptyFilters } from '../lib/types'
import { useApi } from '../lib/useApi'
import FilterSelect from './FilterSelect'
import { reportingDefaults } from '../lib/reporting'

export default function Filters({
  value,
  onChange,
}: {
  value: FilterValues
  onChange: (value: FilterValues) => void
}) {
  const locations = useApi<Location[]>(
    value.time_window ? '/locations' : '/locations?include_archived=true',
  )
  const diseases = useApi<string[]>('/diseases')
  const change = (key: keyof FilterValues, next: string) =>
    onChange({
      ...value,
      [key]: next,
      ...((key === 'date_from' || key === 'date_to') && value.time_window
        ? { time_window: 'historical' as const }
        : {}),
    })
  return (
    <>
      {value.time_window && (
        <div className="view-controls panel">
          <div className="scope-switch" role="group" aria-label="Geography view">
            {(['local', 'regional', 'national'] as const).map((scope) => (
              <button
                key={scope}
                aria-pressed={value.geographic_scope === scope}
                className={value.geographic_scope === scope ? 'primary' : ''}
                onClick={() => onChange({ ...value, geographic_scope: scope, location_id: '' })}
              >
                {scope[0].toUpperCase() + scope.slice(1)}
              </button>
            ))}
          </div>
          <FilterSelect
            label="Reporting window"
            value={value.time_window || 'last28'}
            onChange={(next) =>
              onChange({
                ...value,
                time_window: next as FilterValues['time_window'],
                date_from: '',
                date_to: '',
              })
            }
            options={[
              { value: 'last28', label: 'Last 28 days' },
              { value: 'latest', label: 'Latest available week' },
              { value: 'historical', label: 'Historical range' },
            ]}
          />
        </div>
      )}
      <div className="filters">
        <label>
          From
          <input
            aria-label="From date"
            type="date"
            value={value.date_from}
            onChange={(e) => change('date_from', e.target.value)}
          />
        </label>
        <label>
          To
          <input
            aria-label="To date"
            type="date"
            value={value.date_to}
            onChange={(e) => change('date_to', e.target.value)}
          />
        </label>
        <FilterSelect
          label="Disease"
          value={value.disease}
          disabled={diseases.loading}
          onChange={(next) => change('disease', next)}
          options={[
            { value: '', label: 'All diseases' },
            ...(diseases.data || []).map((d) => ({ value: d, label: d })),
          ]}
        />
        <FilterSelect
          label="Assessment"
          value={value.severity}
          onChange={(next) => change('severity', next)}
          options={[
            { value: '', label: 'All assessments' },
            ...['unassessed', 'low', 'medium', 'high', 'critical'].map((s) => ({
              value: s,
              label: s[0].toUpperCase() + s.slice(1),
              tone: s,
            })),
          ]}
        />
        <FilterSelect
          label="Location"
          value={value.location_id}
          disabled={locations.loading}
          onChange={(next) => change('location_id', next)}
          options={[
            { value: '', label: 'All locations' },
            ...(locations.data || [])
              .filter(
                (l) => !value.geographic_scope || l.geographic_scope === value.geographic_scope,
              )
              .map((l) => ({
                value: String(l.id),
                label: l.name + (l.archived_at ? ' (archived)' : ''),
              })),
          ]}
        />
        <button
          onClick={() => onChange({ ...(value.time_window ? reportingDefaults : emptyFilters) })}
        >
          Reset
        </button>
      </div>
      {(locations.error || diseases.error) && (
        <p className="error" role="alert">
          Could not load filter options: {locations.error || diseases.error}
        </p>
      )}
    </>
  )
}
