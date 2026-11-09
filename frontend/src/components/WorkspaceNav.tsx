import { NavLink } from 'react-router-dom'

import { navigationGroups } from '../lib/navigation'

const paths: Record<string, string> = {
  overview: 'M3 3h7v7H3z M14 3h7v11h-7z M3 14h7v7H3z M14 18h7v3h-7z',
  review: 'M5 3h14v18H5z M8 8h8 M8 12h5 M8 16h7',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15',
  investigation: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M15.5 15.5L21 21',
  alert: 'M12 3L2 21h20z M12 9v5 M12 17v1',
  resources: 'M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10',
  reports: 'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6',
  feeds: 'M4 7h15l-4-4 M20 17H5l4 4 M19 7v4 M5 17v-4',
  health: 'M2 12h5l3-8 4 16 3-8h5',
  publish: 'M5 14v7h14v-7 M12 3v13 M7 8l5-5 5 5',
  public: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c-5 5-5 13 0 18 5-5 5-13 0-18',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
}
export function NavIcon({ name }: { name: string }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.overview} />
    </svg>
  )
}
export default function WorkspaceNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main navigation">
      {navigationGroups.map((group) => (
        <div className="nav-group" key={group.label}>
          <p className="nav-label">{group.label}</p>
          {group.items.map(([path, label, icon]) => (
            <NavLink key={path} to={path} end={path === '/'} onClick={onNavigate}>
              <NavIcon name={icon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}
