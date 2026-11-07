import type { Filters as FilterValues, Location } from '../lib/types'
import { emptyFilters } from '../lib/types'
import { useApi } from '../lib/useApi'
import FilterSelect from './FilterSelect'

export default function Filters({
  value,
  onChange,
}: {
  value: FilterValues
  onChange: (value: FilterValues) => void
}) {
  const locations = useApi<Location[]>('/locations')
  const diseases = useApi<string[]>('/diseases')
  const change = (key: keyof FilterValues, next: string) => onChange({ ...value, [key]: next })
  return (
    <>
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
          label="Severity"
          value={value.severity}
          onChange={(next) => change('severity', next)}
          options={[
            { value: '', label: 'All severities' },
            ...['low', 'medium', 'high', 'critical'].map((s) => ({
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
            ...(locations.data || []).map((l) => ({ value: String(l.id), label: l.name })),
          ]}
        />
        <button onClick={() => onChange({ ...emptyFilters })}>Reset</button>
      </div>
      {(locations.error || diseases.error) && (
        <p className="error" role="alert">
          Could not load filter options: {locations.error || diseases.error}
        </p>
      )}
    </>
  )
}
