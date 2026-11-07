import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { MAX_BYTES, parseCsv } from '../../lib/csv'
import type { ParsedCsv } from '../../lib/csv'
import { errorMessage } from '../../lib/api'

type Props = { onParsed: (parsed: ParsedCsv, file: File) => void; onReset: () => void }
export default function FileUpload({ onParsed, onReset }: Props) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    accept: { 'text/csv': ['.csv'] },
    maxSize: MAX_BYTES,
    disabled: busy,
    onDrop: async (accepted, rejected) => {
      onReset()
      setError('')
      if (rejected.length) {
        setError(rejected.flatMap((f) => f.errors.map((e) => e.message)).join('; '))
        return
      }
      const file = accepted[0]
      if (!file) return
      setBusy(true)
      try {
        onParsed(await parseCsv(file), file)
      } catch (error) {
        setError(errorMessage(error))
      } finally {
        setBusy(false)
      }
    },
  })
  return (
    <>
      <div {...getRootProps()} className={`dropzone ${isDragActive ? 'dragging' : ''}`}>
        <input {...getInputProps()} aria-label="Upload outbreak CSV" />
        <strong>
          {busy ? 'Reading and validating CSV…' : 'Drop an outbreak CSV here, or click to browse'}
        </strong>
        <p>UTF-8 CSV · Up to 50 MB and 10,000 records</p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
