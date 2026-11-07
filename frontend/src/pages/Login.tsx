import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, errorMessage, setToken } from '../lib/api'
import { useAuth } from '../auth/context'

export default function Login() {
  const [register, setRegister] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { refresh } = useAuth()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    setError('')
    try {
      const result = await api<{ access_token: string }>(
        `/auth/${register ? 'register' : 'login'}`,
        { method: 'POST', body: JSON.stringify(values) },
      )
      setToken(result.access_token)
      await refresh()
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="login-layout">
      <div className="login-intro">
        <div className="brand-mark">
          H<span>+</span>
        </div>
        <p className="eyebrow">PUBLIC HEALTH INTELLIGENCE</p>
        <h1>
          A clearer view.
          <br />A coordinated response.
        </h1>
        <p>Bring outbreak observations and response resources into one geographic view.</p>
        <div className="login-note">HealthMap360 · Daily observations, shared understanding.</div>
      </div>
      <main className="login-card">
        <p className="eyebrow">HEALTHMAP360</p>
        <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
        <p className="muted">
          {register
            ? 'Start with read access. An administrator can grant analyst access.'
            : 'Sign in to your public health workspace.'}
        </p>
        <form onSubmit={submit} className="form-stack">
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={80}
              pattern={register ? '[a-zA-Z0-9_-]+' : undefined}
            />
          </label>
          {register && (
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
          )}
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              minLength={register ? 10 : 1}
              maxLength={128}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setRegister(!register)
            setError('')
          }}
        >
          {register ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </main>
    </div>
  )
}
