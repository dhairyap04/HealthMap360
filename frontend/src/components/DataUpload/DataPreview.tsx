import { OPTIONAL_FIELDS, REQUIRED_FIELDS, validateRows } from '../../lib/csv'
import type { ColumnMapping, ParsedCsv } from '../../lib/csv'

export default function DataPreview({
  parsed,
  mapping,
  onMappingChange,
}: {
  parsed: ParsedCsv
  mapping: ColumnMapping
  onMappingChange: (mapping: ColumnMapping) => void
}) {
  const validations = validateRows(parsed.rows, mapping)
  const invalid = validations.filter((v) => !v.isValid)
  return (
    <div className="form-stack">
      <div className="mapping-grid">
        {[...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].map((field) => (
          <label key={field}>
            {field}
            {REQUIRED_FIELDS.some((f) => f === field) ? ' *' : ' (optional)'}
            <select
              value={mapping[field]}
              onChange={(e) => onMappingChange({ ...mapping, [field]: e.target.value })}
            >
              <option value="">Select column…</option>
              {parsed.fields.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p>
        {validations.filter((v) => v.isValid).length.toLocaleString()} /{' '}
        {parsed.rows.length.toLocaleString()} valid records in the full file. Showing the first 50
        below.
      </p>
      {invalid.length > 0 && (
        <details open className="error">
          <summary>{invalid.length} invalid records. First 50 errors:</summary>
          <ul>
            {invalid.slice(0, 50).map((row) => (
              <li key={row.rowIndex}>
                Row {row.rowIndex + 2}:{' '}
                {row.issues.map((issue) => `${issue.field}: ${issue.message}`).join('; ')}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Import preview">
        <table>
          <thead>
            <tr>
              {parsed.fields.map((f) => (
                <th key={f}>{f}</th>
              ))}
              <th scope="col">Validation</th>
            </tr>
          </thead>
          <tbody>
            {parsed.rows.slice(0, 50).map((row, i) => (
              <tr key={i}>
                {parsed.fields.map((f) => (
                  <td key={f}>{row[f]}</td>
                ))}
                <td>
                  {validations[i].isValid ? (
                    <span className="badge low">Valid</span>
                  ) : (
                    <span className="error-text">
                      {validations[i].issues
                        .map((issue) => `${issue.field}: ${issue.message}`)
                        .join('; ')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
