export type ReviewWindow = {
  date_from: string
  date_to: string
  reported_cases: number | null
  covered_days: number
  observations: number
  state: string
  sources: string[]
  reporting_periods: number[]
}
export type ReviewArea = {
  location_id: number
  location_name: string
  current: ReviewWindow
  previous: ReviewWindow
  comparison: {
    absolute_change: number | null
    percent_change: number | null
    unavailable_reason: string | null
  }
  rate: {
    reported_cases_per_100000: number | null
    unavailable_reason: string | null
    population: number | null
    reference_year: number | null
    source_url: string | null
    area_confirmed: boolean
  }
  investigations: { id: number; title: string; status: string; owner_id: number }[]
}
export type WeeklyReview = {
  demonstration?: boolean
  scenario?: string
  generated_at: string
  disease: string
  geographic_scope: string
  date_from: string
  date_to: string
  historical: boolean
  areas: ReviewArea[]
  note: string
  truncated: boolean
}
export type LaboratoryContext = {
  metric: 'test_positivity'
  unit: 'percent'
  reporting_area: string
  source_name: string
  source_url: string
  methodology_url: string
  retrieved_at: string
  latest_report_date: string | null
  historical: boolean
  limitations: string
  indicators: {
    date: string | null
    virus: string
    tests: number | null
    detections: number | null
    percent_positive: number | null
  }[]
}
