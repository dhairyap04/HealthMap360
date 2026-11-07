import { describe, expect, it } from 'vitest'
import { guessMapping, parseCsvText, validateRows } from './csv'

const header = 'date,location,disease,case_count,severity,latitude,longitude'
const row = '2026-11-01,Edmonton,influenza,0,low,53.5,-113.5'
describe('full-file CSV ingestion', () => {
  it('validates every row beyond the former 100-record preview', () => {
    const csv = parseCsvText(header + '\n' + Array(151).fill(row).join('\n'))
    expect(csv.rows).toHaveLength(151)
    expect(validateRows(csv.rows, guessMapping(csv.fields)).every((r) => r.isValid)).toBe(true)
  })
  it.each(['2026-02-30', '2026-99-99', '0000-01-01'])(
    'rejects invalid calendar date %s',
    (date) => {
      const csv = parseCsvText(header + '\n' + row.replace('2026-11-01', date))
      expect(validateRows(csv.rows, guessMapping(csv.fields))[0].isValid).toBe(false)
    },
  )
  it('accepts zero and leap days', () => {
    const csv = parseCsvText(header + '\n' + row.replace('2026-11-01', '2024-02-29'))
    expect(validateRows(csv.rows, guessMapping(csv.fields))[0].isValid).toBe(true)
  })
  it.each([`${header}\n${row},extra`, `date,date\n1,2`, header, `${header}\n"unfinished`])(
    'rejects malformed or empty CSV',
    (text) => {
      expect(() => parseCsvText(text)).toThrow()
    },
  )
  it('rejects truncation at the import limit', () => {
    expect(() => parseCsvText(header + '\n' + Array(10001).fill(row).join('\n'))).toThrow('10,000')
  })
  it.each(['-1', '1.5', '2147483648'])('rejects invalid count %s', (count) => {
    const csv = parseCsvText(header + '\n' + row.replace(',0,low', `,${count},low`))
    expect(validateRows(csv.rows, guessMapping(csv.fields))[0].isValid).toBe(false)
  })
})
