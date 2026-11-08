import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/context'
import DataPreview from '../components/DataUpload/DataPreview'
import FileUpload from '../components/DataUpload/FileUpload'
import Dialog from '../components/Dialog'
import CaseHistory from '../components/CaseHistory'
import Filters from '../components/Filters'
import LoadState from '../components/LoadState'
import { api, downloadCases, errorMessage, query } from '../lib/api'
import { guessMapping, REQUIRED_FIELDS, validateRows } from '../lib/csv'
import type { ColumnMapping, ParsedCsv } from '../lib/csv'
import { useReportingFilters } from '../lib/reporting'
import type { ImportBatch, Observation, Page } from '../lib/types'
import { useApi } from '../lib/useApi'

export default function Reports() {
  const { user } = useAuth()
  const writable = user?.role !== 'public'
  const [filters, setFilters] = useReportingFilters(false)
  const [page, setPage] = useState(1)
  const [filterRevision, setFilterRevision] = useState(0)
  const records = useApi<Page<Observation>>(`/cases${query({ ...filters, page })}`)
  const history = useApi<ImportBatch[]>(writable ? '/imports' : null)
  const [upload, setUpload] = useState<{
    parsed: ParsedCsv
    file: File
    mapping: ColumnMapping
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [edit, setEdit] = useState<Observation | null>(null)
  const [remove, setRemove] = useState<Observation | null>(null)
  const [audit, setAudit] = useState<Observation | null>(null)
  const invalid = upload
    ? validateRows(upload.parsed.rows, upload.mapping).filter((v) => !v.isValid).length
    : 0
  const selected = upload ? Object.values(upload.mapping).filter(Boolean) : []
  const mappingValid =
    upload &&
    REQUIRED_FIELDS.every((f) => upload.mapping[f]) &&
    new Set(selected).size === selected.length
  async function importFile() {
    if (!upload) return
    const body = new FormData()
    body.set('file', upload.file)
    body.set('mapping', JSON.stringify(upload.mapping))
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const result = await api<{ imported: number; skipped: number }>('/imports', {
        method: 'POST',
        body,
      })
      setStatus(
        `Import complete: ${result.imported} records saved, ${result.skipped} exact duplicates skipped.`,
      )
      setUpload(null)
      setFilterRevision((n) => n + 1)
      records.reload()
      history.reload()
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function updateRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!edit) return
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    setError('')
    try {
      await api(`/cases/${edit.id}?expected_version=${edit.version}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...fields,
          location_id: edit.location_id,
          case_count: Number(fields.case_count),
          reporting_period_days: Number(fields.reporting_period_days),
        }),
      })
      setEdit(null)
      setFilterRevision((n) => n + 1)
      records.reload()
      setStatus('Observation updated.')
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function deleteRecord() {
    if (!remove) return
    setBusy(true)
    setError('')
    try {
      await api(`/cases/${remove.id}`, { method: 'DELETE' })
      setRemove(null)
      setPage(1)
      setFilterRevision((n) => n + 1)
      records.reload()
      setStatus('Observation deleted.')
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">REPORTED OBSERVATIONS</p>
          <h1>Reports & data</h1>
          <p className="muted">Import, review and export disease observations by report date.</p>
        </div>
        <button
          disabled={busy}
          onClick={() => {
            setError('')
            setBusy(true)
            void downloadCases(filters)
              .catch((e) => setError(errorMessage(e)))
              .finally(() => setBusy(false))
          }}
        >
          Export filtered CSV ↓
        </button>
      </div>
      {status && (
        <p role="status" className="success">
          {status}
        </p>
      )}
      {error && !edit && !remove && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {writable && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Import outbreak data</h2>
            <a href={`${import.meta.env.BASE_URL}sample-outbreaks.csv`} download>
              Download sample CSV
            </a>
          </div>
          <p className="muted">
            One count per report date, location and disease. Zero is valid. Reporting periods are
            daily unless specified as weekly. New locations need latitude and longitude. Exact
            duplicates are skipped; conflicting records must be edited.
          </p>
          <FileUpload
            onReset={() => {
              setUpload(null)
              setError('')
              setStatus('')
            }}
            onParsed={(parsed, file) =>
              setUpload({ parsed, file, mapping: guessMapping(parsed.fields) })
            }
          />
          {upload && (
            <>
              <h3>{upload.file.name}</h3>
              <DataPreview
                parsed={upload.parsed}
                mapping={upload.mapping}
                onMappingChange={(mapping) => {
                  setUpload({ ...upload, mapping })
                  setError('')
                }}
              />
              {!mappingValid && (
                <p className="error-text">Map every required field to a different column.</p>
              )}
              <button
                className="primary"
                disabled={busy || invalid > 0 || !mappingValid}
                onClick={() => void importFile()}
              >
                {busy ? 'Saving…' : `Import ${upload.parsed.rows.length.toLocaleString()} records`}
              </button>
            </>
          )}
        </section>
      )}
      <Filters
        key={filterRevision}
        value={filters}
        onChange={(value) => {
          setFilters(value)
          setPage(1)
        }}
      />
      <LoadState loading={records.loading} error={records.error} retry={records.reload} />
      {records.data && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Observations</h2>
            <span className="muted">{records.data.total.toLocaleString()} records</span>
          </div>
          {!records.data.items.length ? (
            <p className="empty">No observations match this view.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Location</th>
                    <th>Disease</th>
                    <th>Cases</th>
                    <th>Period</th>
                    <th>Investigation</th>
                    <th>Assessment</th>
                    <th>Source</th>
                    {writable && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {records.data.items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date}</td>
                      <td>{row.location.name}</td>
                      <td>{row.disease}</td>
                      <td>
                        {row.case_count.toLocaleString()}
                        <small className="muted">
                          {row.provenance} ·{' '}
                          {row.quality_status === 'valid'
                            ? 'valid reporting interval'
                            : 'Conflict: excluded from totals'}
                        </small>
                      </td>
                      <td>{row.reporting_period_days === 7 ? 'Weekly' : 'Daily'}</td>
                      <td>
                        {row.outbreak_id ? (
                          <Link to={`/outbreaks/${row.outbreak_id}`}>
                            Investigation #{row.outbreak_id}
                          </Link>
                        ) : (
                          'Unassigned'
                        )}
                      </td>
                      <td>
                        <span className={`badge ${row.severity}`}>{row.severity}</span>
                      </td>
                      <td>{row.source || '—'}</td>
                      {writable && (
                        <td className="actions">
                          <button onClick={() => setAudit(row)}>History</button>
                          <button
                            onClick={() => {
                              setEdit(row)
                              setError('')
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="danger-text"
                            onClick={() => {
                              setRemove(row)
                              setError('')
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {Math.max(1, Math.ceil(records.data.total / 50))}
            </span>
            <button disabled={page * 50 >= records.data.total} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        </section>
      )}
      {writable && (
        <section className="panel">
          <h2>Recent imports</h2>
          <LoadState loading={history.loading} error={history.error} retry={history.reload} />
          {history.data &&
            (history.data.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Saved</th>
                      <th>Skipped</th>
                      <th>Imported by</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.map((batch) => (
                      <tr key={batch.id}>
                        <td>{batch.filename}</td>
                        <td>{batch.imported}</td>
                        <td>{batch.skipped}</td>
                        <td>{batch.username}</td>
                        <td>
                          {new Date(
                            batch.created_at.endsWith('Z') ||
                              /[+-]\d\d:\d\d$/.test(batch.created_at)
                              ? batch.created_at
                              : `${batch.created_at}Z`,
                          ).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">No imports yet.</p>
            ))}
        </section>
      )}
      {edit && (
        <Dialog
          title={`Edit observation · ${edit.location.name}`}
          close={() => {
            if (!busy) setEdit(null)
          }}
        >
          <form onSubmit={updateRecord} className="form-stack">
            {edit.feed_id && (
              <p className="notice">
                Saving a correction makes this observation analyst-owned. Future feed syncs will
                stop rather than overwrite your changes.
              </p>
            )}
            <label>
              Date
              <input type="date" name="date" required defaultValue={edit.date} />
            </label>
            <label>
              Disease
              <input name="disease" required maxLength={120} defaultValue={edit.disease} />
            </label>
            <label>
              Reported case count
              <input
                name="case_count"
                type="number"
                required
                min={0}
                max={2147483647}
                step={1}
                defaultValue={edit.case_count}
              />
            </label>
            <label>
              Reporting period
              <select name="reporting_period_days" defaultValue={edit.reporting_period_days || 1}>
                <option value={1}>Daily</option>
                <option value={7}>Weekly</option>
              </select>
            </label>
            <label>
              Assessment
              <select name="severity" defaultValue={edit.severity}>
                {['unassessed', 'low', 'medium', 'high', 'critical'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Source
              <input name="source" maxLength={300} defaultValue={edit.source || ''} />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Save changes
            </button>
          </form>
        </Dialog>
      )}
      {audit && (
        <Dialog title="Observation history" close={() => setAudit(null)}>
          <CaseHistory observation={audit} />
        </Dialog>
      )}
      {remove && (
        <Dialog
          title="Delete observation?"
          close={() => {
            if (!busy) setRemove(null)
          }}
        >
          <p>
            This removes the {remove.disease} observation for {remove.location.name} on{' '}
            {remove.date}. Import history is retained.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="danger" disabled={busy} onClick={() => void deleteRecord()}>
            Delete observation
          </button>
        </Dialog>
      )}
    </>
  )
}
