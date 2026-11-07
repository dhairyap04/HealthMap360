import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense, useState } from 'react'
import { useAuth } from './auth/context'
import { errorMessage } from './lib/api'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const MapPage = lazy(() => import('./pages/Map'))
const Reports = lazy(() => import('./pages/Reports'))
const Resources = lazy(() => import('./pages/Resources'))
const Settings = lazy(() => import('./pages/Settings'))
import Login from './pages/Login'

export default function App() {
  const { user, signOut } = useAuth()
  const [error, setError] = useState('')
  if (!user) return <Login />
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
          <span className="workspace-badge">
            ● {user.role === 'public' ? 'Read access' : 'Data management'}
          </span>
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
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
        <footer>
          HealthMap360 · Counts represent reported daily cases, not active infections.
        </footer>
      </div>
    </div>
  )
}
