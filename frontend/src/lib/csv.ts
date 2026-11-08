import Papa from 'papaparse'

export const MAX_ROWS = 10000
export const MAX_BYTES = 50 * 1024 * 1024
export const REQUIRED_FIELDS = ['date', 'location', 'disease', 'case_count'] as const
export const OPTIONAL_FIELDS = [
  'metric',
  'severity',
  'source',
  'latitude',
  'longitude',
  'reporting_period_days',
] as const
export type RequiredField = (typeof REQUIRED_FIELDS)[number]
export type CsvField = RequiredField | (typeof OPTIONAL_FIELDS)[number]
export type RawCsvRow = Record<string, string>
export type ColumnMapping = Record<CsvField, string>
export type ParsedCsv = { rows: RawCsvRow[]; fields: string[] }
export type RowValidation = {
  rowIndex: number
  isValid: boolean
  issues: { field: CsvField; message: string }[]
}
export const SEVERITY_LEVELS = new Set(['unassessed', 'low', 'medium', 'high', 'critical'])

export function parseCsvText(text: string): ParsedCsv {
  if (text.includes('\0')) throw new Error('CSV contains invalid null characters')
  const header =
    Papa.parse<string[]>(text, { preview: 1, skipEmptyLines: true }).data[0]?.map((h) =>
      h.trim(),
    ) || []
  if (!header.length || new Set(header).size !== header.length || header.some((h) => !h))
    throw new Error('Use unique, nonempty column headers')
  const result = Papa.parse<RawCsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    preview: MAX_ROWS + 1,
  })
  if (result.errors.length)
    throw new Error(
      result.errors
        .slice(0, 5)
        .map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`)
        .join('; '),
    )
  if (!result.data.length) throw new Error('CSV has no data rows')
  if (result.data.length > MAX_ROWS)
    throw new Error('Maximum 10,000 records per file. Split this CSV into smaller files.')
  return { rows: result.data, fields: result.meta.fields || [] }
}

export async function parseCsv(file: File): Promise<ParsedCsv> {
  if (file.size > MAX_BYTES) throw new Error('Maximum file size is 50 MB')
  const bytes = await file.arrayBuffer()
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('Save your CSV with UTF-8 encoding')
  }
  return parseCsvText(text)
}

export function guessMapping(fields: string[]): ColumnMapping {
  const aliases: Record<CsvField, string[]> = {
    date: ['date', 'report_date', 'day'],
    location: ['location', 'city'],
    disease: ['disease', 'condition', 'illness'],
    case_count: ['case_count', 'cases', 'count'],
    metric: ['metric'],
    severity: ['severity', 'level'],
    source: ['source'],
    reporting_period_days: ['reporting_period_days', 'period_days'],
    latitude: ['latitude', 'lat'],
    longitude: ['longitude', 'lon', 'lng'],
  }
  return Object.fromEntries(
    [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].map((key) => [
      key,
      fields.find((f) => aliases[key].includes(f.toLowerCase())) || '',
    ]),
  ) as ColumnMapping
}

export function validateRows(rows: RawCsvRow[], mapping: ColumnMapping): RowValidation[] {
  return rows.map((row, index) => {
    const issues: RowValidation['issues'] = []
    const value = (key: CsvField) => String(row[mapping[key]] ?? '').trim()
    const day = value('date')
    const date = new Date(`${day}T00:00:00Z`)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      day.startsWith('0000') ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== day
    )
      issues.push({ field: 'date', message: 'Use a real calendar date in YYYY-MM-DD format' })
    if (!value('location') || value('location').length > 200)
      issues.push({ field: 'location', message: 'Location is required (maximum 200 characters)' })
    if (!value('disease') || value('disease').length > 120)
      issues.push({ field: 'disease', message: 'Disease is required (maximum 120 characters)' })
    if (value('metric') && value('metric') !== 'reported_cases')
      issues.push({
        field: 'metric',
        message:
          'This importer accepts reported_cases only. Laboratory detections, positivity and wastewater require a different metric adapter.',
      })
    const period = value('reporting_period_days')
    if (period && !['1', '7'].includes(period))
      issues.push({
        field: 'reporting_period_days',
        message: 'Use 1 for daily or 7 for weekly reports',
      })
    const count = value('case_count')
    if (!/^\d+$/.test(count) || !Number.isSafeInteger(Number(count)) || Number(count) > 2147483647)
      issues.push({
        field: 'case_count',
        message: 'Use a nonnegative whole number, up to 2,147,483,647',
      })
    if (value('severity') && !SEVERITY_LEVELS.has(value('severity').toLowerCase()))
      issues.push({
        field: 'severity',
        message: 'Use unassessed, low, medium, high or critical (blank defaults to unassessed)',
      })
    if (value('source').length > 300)
      issues.push({ field: 'source', message: 'Source must be 300 characters or fewer' })
    if (value('latitude') || value('longitude')) {
      for (const [key, limit] of [
        ['latitude', 90],
        ['longitude', 180],
      ] as const) {
        const coordinate = Number(value(key))
        if (!value(key) || !Number.isFinite(coordinate) || Math.abs(coordinate) > limit)
          issues.push({
            field: key,
            message: `Provide a coordinate between -${limit} and ${limit}`,
          })
      }
    }
    return { rowIndex: index, isValid: issues.length === 0, issues }
  })
}
