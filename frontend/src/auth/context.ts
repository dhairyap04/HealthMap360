import { createContext, useContext } from 'react'
import type { User } from '../lib/types'
export const AuthContext = createContext<{
  user: User | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}>({ user: null, refresh: async () => {}, signOut: async () => {} })
export const useAuth = () => useContext(AuthContext)
