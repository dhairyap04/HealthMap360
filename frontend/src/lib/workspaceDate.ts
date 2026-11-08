import { useApi } from './useApi'
export function useWorkspaceDate() {
  const clock = useApi<{ today: string }>('/public/config')
  const now = new Date()
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return clock.data?.today || local
}
