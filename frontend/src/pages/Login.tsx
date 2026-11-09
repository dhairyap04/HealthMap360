import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, errorMessage, setToken } from '../lib/api'
import { useAuth } from '../auth/context'

export default function Login() {
  const [register, setRegister] = useState(false)
  const [recover, setRecover] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { refresh } = useAuth()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    setError('')
    try {
      if (recover) {
        await api('/auth/recover', { method: 'POST', body: JSON.stringify(values) })
        setRecover(false)
        setStatus(
          'Password reset. Sign in with your new password; existing authenticator requirements still apply.',
        )
        return
      }
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
      <aside className="login-intro" aria-label="About HealthMap360">
        <div className="brand-mark">
          H<span>+</span>
        </div>
        <p className="eyebrow">PUBLIC HEALTH INTELLIGENCE</p>
        <h1>
          A clearer view.
          <br />A coordinated response.
        </h1>
        <p>Bring outbreak observations and response resources into one geographic view.</p>
        <div className="login-note">
          HealthMap360 · Reported observations, shared understanding.
        </div>
      </aside>
      <main className="login-card">
        <p className="eyebrow">HEALTHMAP360</p>
        <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
        <p className="muted">
          {register
            ? 'Start with read access. An administrator can grant analyst access.'
            : 'Sign in to your public health workspace.'}
        </p>
        {status && (
          <p className="success" role="status">
            {status}
          </p>
        )}
        {recover ? (
          <form onSubmit={submit} className="form-stack">
            <h3>Verified account recovery</h3>
            <p>
              Ask the workspace operator to verify your identity and provide a single-use recovery
              token. No email is sent by this application.
            </p>
            <label>
              Recovery token
              <input name="token" required autoComplete="off" />
            </label>
            <label>
              New password
              <input
                name="new_password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Reset password
            </button>
          </form>
        ) : (
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
            {!register && (
              <label>
                Authenticator code (if enabled)
                <input
                  name="otp"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
            </button>
          </form>
        )}
        <button
          className="text-button"
          onClick={() => {
            setRegister(!register)
            setError('')
          }}
        >
          {register ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
        <button
          className="text-button"
          onClick={() => {
            setRecover(!recover)
            setError('')
          }}
        >
          {recover ? 'Back to sign in' : 'Recover account'}
        </button>
      </main>
    </div>
  )
}
