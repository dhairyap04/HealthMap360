import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api, errorMessage, setToken, token } from '../lib/api'
import type { User } from '../lib/types'
import { AuthContext } from './context'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(Boolean(token()))
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setUser(await api<User>('/auth/me'))
    setError('')
  }, [])
  const signOut = useCallback(async () => {
    // Revoke on the server before discarding the local session.
    await api('/auth/logout', { method: 'POST' })
    setToken(null)
    setUser(null)
  }, [])
  useEffect(() => {
    let alive = true
    const expired = () => {
      setUser(null)
      setError('Your session ended. Please sign in again.')
    }
    window.addEventListener('session-expired', expired)
    if (token())
      api<User>('/auth/me')
        .then((value) => {
          if (alive) setUser(value)
        })
        .catch((error) => {
          if (alive) setError(errorMessage(error))
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    return () => {
      alive = false
      window.removeEventListener('session-expired', expired)
    }
  }, [])
  if (loading) return <div className="welcome">Restoring your session…</div>
  return (
    <AuthContext.Provider value={{ user, refresh, signOut }}>
      {error && (
        <div role="status" className="notice">
          {error}
        </div>
      )}
      {children}
    </AuthContext.Provider>
  )
}
