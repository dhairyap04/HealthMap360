import { Link, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import MapPage from './pages/Map'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

export default function App() {
  return (
    <div className="min-h-screen">
      <nav className="flex gap-4 p-4 bg-medicalBlue text-white">
        <Link to="/">Dashboard</Link>
        <Link to="/map">Map</Link>
        <Link to="/reports">Reports</Link>
        <Link to="/settings">Settings</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  )
}
