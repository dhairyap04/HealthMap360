import type { Assessment, Location, Severity } from './types'
export type Outbreak = {
  id: number
  title: string
  disease: string
  status: string
  priority: Severity
  started_on: string
  ended_on: string | null
  description: string
  owner_id: number
  owner: string
  locations: Location[]
  observations: number
  reported_cases: number | null
  totals_by_location: {
    location_id: number
    location_name: string
    geographic_scope: string
    cases: number
  }[]
  aggregation_note: string
  excluded_for_review: number
  updated_at: string
}
export type OutbreakDetail = Outbreak & {
  updates: { id: number; body: string; kind: string; username: string; created_at: string }[]
  trend: { date: string; cases: number }[]
}
export type AlertRule = {
  id: number
  name: string
  disease: string | null
  location_id: number | null
  threshold: number
  geographic_scope: string
  window_days: number
  severity: Severity
  enabled: boolean
}
export type Alert = {
  outbreak_id: number | null
  id: number
  is_historical: boolean
  data_state: string
  latest_report_date: string | null
  rule_name: string
  disease: string
  location_name: string
  severity: Severity
  value: number
  threshold: number
  window_start: string
  window_end: string
  status: string
  resolution: string | null
  created_at: string
}
export type Feed = {
  id: number
  name: string
  provider: 'who_covid_weekly'
  country_code: string
  location_id: number
  location_name: string
  severity: Assessment
  start_date: string
  interval_minutes: number
  enabled: boolean
  last_synced_at: string | null
  next_sync_at: string | null
  last_error: string | null
}
export type FeedRun = {
  id: number
  status: string
  imported: number
  updated: number
  skipped: number
  latest_report_date: string | null
  message: string
  started_at: string
}
export type FeedCatalog = {
  providers: { id: string; name: string; source_url: string; description: string }[]
  countries: { code: string; name: string }[]
}
export type Monitoring = {
  open_alerts: number
  active_outbreaks: number
  enabled_feeds: number
  failed_feeds: number
}
export function dateTime(value: string | null) {
  return value
    ? new Date(/[Zz]$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`).toLocaleString()
    : 'Not yet'
}
