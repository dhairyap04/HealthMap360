export default function LoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean
  error: string
  retry?: () => void
}) {
  if (loading)
    return (
      <p className="empty" role="status">
        Loading workspace data…
      </p>
    )
  if (error)
    return (
      <div className="error" role="alert">
        {error} {retry && <button onClick={retry}>Try again</button>}
      </div>
    )
  return null
}
