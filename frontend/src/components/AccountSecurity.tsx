import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../auth/context'
export default function AccountSecurity({ required = false }: { required?: boolean }) {
  const { user, signOut } = useAuth()
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const Heading = required ? 'h1' : 'h2'
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(e.currentTarget)
    try {
      if (!secret) {
        const result = await api<{ secret: string }>('/auth/mfa/enroll', {
          method: 'POST',
          body: JSON.stringify({ password: form.get('password') }),
        })
        setSecret(result.secret)
      } else {
        await api('/auth/mfa/confirm', {
          method: 'POST',
          body: JSON.stringify({ password: form.get('password'), code: form.get('code') }),
        })
        await signOut().catch(() => {
          window.location.reload()
        })
      }
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  if (user?.mfa_enabled)
    return (
      <section className="panel">
        <h2>Account security</h2>
        <p>
          Authenticator enabled. A fresh six-digit code is required at sign-in. Contact the verified
          workspace operator for recovery.
        </p>
      </section>
    )
  return (
    <section className="panel">
      <Heading>
        {required ? 'Administrator authenticator required' : 'Enable an authenticator'}
      </Heading>
      <p className="muted">
        {required
          ? 'Production administrator access is locked until enrollment is complete.'
          : 'Add a second factor to protect your account.'}{' '}
        Enrollment expires after ten minutes. Confirmation ends existing sessions.
      </p>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Current password for authenticator
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {secret && (
          <>
            <p>
              Add this secret to an authenticator app using time-based, six-digit codes (SHA-1, 30
              seconds). Store it securely.
            </p>
            <code className="mfa-secret">{secret}</code>
            <label>
              Confirmation code
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
              />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={busy} className="primary">
          {secret ? 'Confirm authenticator and sign in again' : 'Start authenticator enrollment'}
        </button>
      </form>
      {required && (
        <button
          onClick={() => {
            void signOut()
          }}
        >
          Sign out
        </button>
      )}
    </section>
  )
}
