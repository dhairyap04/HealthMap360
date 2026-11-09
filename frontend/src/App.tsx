import { NavLink, Navigate, Route, Routes, useLocation, Link } from 'react-router-dom'
import { lazy, Suspense, useState, useEffect } from 'react'
import { useAuth } from './auth/context'
import { errorMessage } from './lib/api'
const WeeklyReview = lazy(() => import('./pages/WeeklyReview'))
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
import WorkspaceNav, { NavIcon } from './components/WorkspaceNav'
import { navigationGroups } from './lib/navigation'
import WorkspaceHelp from './components/WorkspaceHelp'
import Dialog from './components/Dialog'
import AccountSecurity from './components/AccountSecurity'

export default function App() {
  const { user, signOut } = useAuth()
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const location = useLocation()
  const currentPage =
    navigationGroups
      .flatMap((group) => group.items)
      .find(
        ([path]) =>
          path === (location.pathname.startsWith('/outbreaks/') ? '/outbreaks' : location.pathname),
      )?.[1] || 'Overview'
  const pageTitle = user?.mfa_required
    ? 'Secure your account'
    : user?.role === 'public' ||
        (location.pathname.startsWith('/public') && !location.pathname.startsWith('/publications'))
      ? 'Public reports'
      : !user
        ? 'Sign in'
        : currentPage
  useEffect(() => {
    document.title = `${pageTitle} · HealthMap360`
  }, [pageTitle])

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
        <footer className="public-entry">
          <Link to="/public">View published reports without signing in →</Link>
        </footer>
      </>
    )
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          const main = document.getElementById('main-content')
          main?.focus()
          main?.scrollIntoView({ block: 'start' })
        }}
      >
        Skip to main content
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <NavLink to="/" className="brand">
          <div className="brand-mark small">
            H<span>+</span>
          </div>
          <span>
            HealthMap<span className="brand-accent">360</span>
          </span>
        </NavLink>
        <p className="brand-caption">FIELD NOTES / SHARED INTELLIGENCE</p>
        <WorkspaceNav />
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
          <div className="topbar-context">
            <span className="workspace-monogram" aria-hidden="true">
              H+
            </span>
            <span>
              Analyst workspace <span aria-hidden="true">/</span> <strong>{currentPage}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            <button className="text-button" onClick={() => setHelpOpen(true)}>
              Workspace guide
            </button>
            <span className="workspace-badge">Private workspace</span>
            <button
              className="mobile-menu-button"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              Menu <NavIcon name="overview" />
            </button>
            <button
              className="mobile-signout text-button"
              onClick={() => {
                setError('')
                void signOut().catch((e) => setError(errorMessage(e)))
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        <nav className="mobile-quicknav" aria-label="Quick navigation">
          {[
            ['/', 'Overview'],
            ['/review', 'Weekly review'],
            ['/map', 'Outbreak map'],
          ].map(([path, label]) => (
            <NavLink key={path} to={path} end={path === '/'}>
              {label}
            </NavLink>
          ))}
        </nav>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <main className="page" id="main-content" tabIndex={-1} key={location.pathname}>
          <Suspense
            fallback={
              <p className="empty" role="status">
                Loading page…
              </p>
            }
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/review" element={<WeeklyReview />} />
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
        <footer>
          <span>
            HealthMap360 <span aria-hidden="true">/</span> Evidence into action.
          </span>
          <span>Counts represent reported cases, not active infections.</span>
        </footer>
      </div>
      {menuOpen && (
        <Dialog title="Workspace navigation" close={() => setMenuOpen(false)}>
          <WorkspaceNav onNavigate={() => setMenuOpen(false)} />
          <button
            className="button"
            onClick={() => {
              setMenuOpen(false)
              setHelpOpen(true)
            }}
          >
            Workspace guide
          </button>
        </Dialog>
      )}
      {helpOpen && <WorkspaceHelp close={() => setHelpOpen(false)} />}
    </div>
  )
}
