export type Role = 'public' | 'analyst' | 'admin'
export type User = { id: number; username: string; email: string; role: Role }
export type Location = {
  id: number
  name: string
  latitude: number
  longitude: number
  population: number | null
  administrative_level: string | null
  country_code: string | null
  region_code: string | null
  geographic_scope: GeographicScope | 'unclassified'
}
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type Assessment = Severity | 'unassessed'
export type GeographicScope = 'local' | 'regional' | 'national'
export type Observation = {
  id: number
  location_id: number
  location: Location
  date: string
  disease: string
  case_count: number
  severity: Assessment
  source: string | null
  reporting_period_days: 1 | 7
  outbreak_id: number | null
  feed_id: number | null
}
export type Resource = {
  id: number
  type: string
  quantity: number
  location_id: number | null
  location: Location | null
  allocated_date: string | null
}
export type Filters = {
  geographic_scope?: GeographicScope
  time_window?: 'last28' | 'latest' | 'historical'
  date_from: string
  date_to: string
  disease: string
  severity: string
  location_id: string
}
export const emptyFilters: Filters = {
  date_from: '',
  date_to: '',
  disease: '',
  severity: '',
  location_id: '',
}
export type Summary = {
  view: {
    geographic_scope: GeographicScope
    time_window: 'last28' | 'latest' | 'historical'
    date_from: string | null
    date_to: string | null
    latest_report_date: string | null
    historical: boolean
    reporting_periods: number[]
    sources: string[]
  }
  total_cases: number
  observations: number
  affected_locations: number
  diseases: number
  resource_units: number
  trend: { date: string; cases: number }[]
  by_disease: { disease: string; cases: number }[]
  by_severity: { severity: string; cases: number }[]
  locations: {
    id: number
    name: string
    latitude: number
    longitude: number
    cases: number
    first_report: string
    latest_report: string
    severity: Assessment
  }[]
}
export type ImportBatch = {
  id: number
  filename: string
  imported: number
  skipped: number
  created_at: string
  username: string
}
export type Page<T> = { items: T[]; total: number; page: number; page_size: number }

export type PlaceResult = {
  id: string
  name: string
  label: string
  latitude: number
  longitude: number
  administrative_level: string
  country: string
  country_code?: string | null
  region_code?: string | null
  region: string
}
