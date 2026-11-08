import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { Monitoring } from '../lib/surveillance'
import { useApi } from '../lib/useApi'
export default function MonitoringStrip() {
  const { data, reload } = useApi<Monitoring>('/monitoring')
  useEffect(() => {
    const timer = setInterval(reload, 60000)
    return () => clearInterval(timer)
  }, [reload])
  if (!data) return null
  return (
    <div className="monitoring-strip">
      <Link to="/outbreaks">
        <span className="monitoring-dot" />
        {data.active_outbreaks} open investigations
      </Link>
      <Link to="/alerts" className={data.open_alerts ? 'attention' : ''}>
        {data.open_alerts} new alerts
      </Link>
      <Link to="/feeds">
        {data.enabled_feeds} connected feeds
        {data.failed_feeds > 0 ? ` · ${data.failed_feeds} need attention` : ''}
      </Link>
    </div>
  )
}
