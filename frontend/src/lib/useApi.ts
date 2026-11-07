import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from './api'

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((n) => n + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setError('')
    setLoading(Boolean(path))
    if (path)
      api<T>(path, { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted) setData(value)
        })
        .catch((error) => {
          if (!controller.signal.aborted) setError(errorMessage(error))
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    return () => controller.abort()
  }, [path, revision])
  return { data, error, loading, reload }
}
