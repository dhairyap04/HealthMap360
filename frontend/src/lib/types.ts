export type Role = 'public' | 'analyst' | 'admin'
export type User = { id: number; username: string; email: string; role: Role }
export type Location = {
  id: number
  name: string
  latitude: number
  longitude: number
  population: number | null
  administrative_level: string | null
}
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type Observation = {
  id: number
  location_id: number
  location: Location
  date: string
  disease: string
  case_count: number
  severity: Severity
  source: string | null
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
    severity: Severity
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
  region: string
}
