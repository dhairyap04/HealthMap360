const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const tokenKey = 'healthmap360-token'
export const token = () => sessionStorage.getItem(tokenKey)
export function setToken(value: string | null) {
  if (value) sessionStorage.setItem(tokenKey, value)
  else sessionStorage.removeItem(tokenKey)
}

export function query(values: object): string {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) params.set(key, String(value))
  })
  return params.toString() ? `?${params}` : ''
}

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (token()) headers.set('Authorization', `Bearer ${token()}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${base}${path}`, { ...init, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: 'Could not reach the service' }))
    if (response.status === 401 && token()) {
      setToken(null)
      window.dispatchEvent(new Event('session-expired'))
    }
    const detail = body.detail
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail
              .map(
                (item: { loc: string[]; msg: string }) =>
                  `${item.loc.slice(1).join('.')}: ${item.msg}`,
              )
              .join('; ')
          : detail?.message
            ? `${detail.message} ${(detail.errors || []).map((e: { row: number; message: string }) => `Row ${e.row}: ${e.message}`).join('; ')}`
            : `Request failed (${response.status})`
    throw new Error(message)
  }
  return response
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await request(path, init)
  return response.status === 204 ? (undefined as T) : response.json()
}

export async function downloadCases(filters: object) {
  const response = await request(`/cases/export${query(filters)}`)
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = 'healthmap360-cases.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong'
