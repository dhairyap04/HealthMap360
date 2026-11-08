import { NavLink, Navigate, Route, Routes, useLocation, Link } from 'react-router-dom'
import { lazy, Suspense, useState } from 'react'
import { useAuth } from './auth/context'
import { errorMessage } from './lib/api'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const MapPage = lazy(() => import('./pages/Map'))
const Reports = lazy(() => import('./pages/Reports'))
const Resources = lazy(() => import('./pages/Resources'))
const Settings = lazy(() => import('./pages/Settings'))
const Outbreaks = lazy(() => import('./pages/Outbreaks'))
const Alerts = lazy(() => import('./pages/Alerts'))
const PublicPortal = lazy(() => import('./pages/PublicPortal'))
const Publications = lazy(() => import('./pages/Publications'))
const DataHealth = lazy(() => import('./pages/DataHealth'))
const Feeds = lazy(() => import('./pages/Feeds'))
import Login from './pages/Login'
import AccountSecurity from './components/AccountSecurity'

export default function App() {
  const { user, signOut } = useAuth()
  const [error, setError] = useState('')
  const location = useLocation()
  if (
    (location.pathname.startsWith('/public') && !location.pathname.startsWith('/publications')) ||
    user?.role === 'public'
  )
    return (
      <Suspense fallback={<p>Loading public reports…</p>}>
        <Routes>
          <Route path="/public/locations/:locationId" element={<PublicPortal />} />
          <Route path="*" element={<PublicPortal />} />
        </Routes>
      </Suspense>
    )
  if (user?.mfa_required)
    return (
      <main className="page">
        <AccountSecurity required />
      </main>
    )
  if (!user)
    return (
      <>
        <Login />
        <div className="public-entry">
          <Link to="/public">View published reports without signing in →</Link>
        </div>
      </>
    )
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <div className="brand-mark small">
            H<span>+</span>
          </div>
          <span>
            HealthMap<span className="brand-accent">360</span>
          </span>
        </NavLink>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {[
            ['/', 'Overview', '◫'],
            ['/map', 'Outbreak map', '◎'],
            ['/reports', 'Reports & data', '▤'],
            ['/outbreaks', 'Investigations', '◉'],
            ['/alerts', 'Alerts', '◇'],
            ['/feeds', 'Data feeds', '⇄'],
            ['/data-health', 'Data health', '◷'],
            ['/publications', 'Publication review', '▣'],
            ['/public', 'Public reports', '↗'],
            ['/resources', 'Resources', '▦'],
            ['/settings', 'Settings', '⚙'],
          ].map(([path, label, icon]) => (
            <NavLink key={path} to={path} end={path === '/'}>
              <span aria-hidden="true">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{user.username}</strong>
            <small>{user.role}</small>
          </div>
          <button
            className="text-button"
            onClick={() => {
              setError('')
              void signOut().catch((e) => setError(errorMessage(e)))
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>Public health workspace</span>
          <span className="workspace-badge">● Data management</span>
        </header>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <main className="page">
          <Suspense
            fallback={
              <p className="empty" role="status">
                Loading page…
              </p>
            }
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/resources" element={<Resources />} />
              <Route path="/outbreaks" element={<Outbreaks />} />
              <Route path="/outbreaks/:id" element={<Outbreaks />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/feeds" element={<Feeds />} />
              <Route path="/data-health" element={<DataHealth />} />
              <Route path="/publications" element={<Publications />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
        <footer>HealthMap360 · Counts represent reported cases, not active infections.</footer>
      </div>
    </div>
  )
}
