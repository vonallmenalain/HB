import { type FormEvent, useState } from 'react'

import { BigButton } from '@/ui/BigButton'
import { HeadphonesMark } from '@/ui/HeadphonesMark'
import { Notice } from '@/ui/Notice'
import { Screen } from '@/ui/Screen'
import { TextField } from '@/ui/TextField'

import { authErrorMessage } from './authErrors'
import { useAuth } from './authContext'

type Mode = 'password' | 'link'

/**
 * Anmeldung – ausschliesslich für Eltern.
 *
 * Kinder sehen diesen Bildschirm im Normalfall nie: Die Sitzung bleibt dauerhaft
 * bestehen, und abmelden kann man sich nur im Elternbereich.
 */
export function LoginScreen() {
  const { actions, linkError, clearLinkError } = useAuth()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkSent, setLinkSent] = useState(false)

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(authErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(event: FormEvent): void {
    event.preventDefault()
    if (mode === 'password') {
      void run(() => actions.signInWithPassword(email, password))
    } else {
      void run(async () => {
        await actions.sendLoginLink(email)
        setLinkSent(true)
      })
    }
  }

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-6 py-8">
        <div className="flex flex-col items-center gap-3">
          <HeadphonesMark className="h-20 w-20 text-primary" />
          <h1 className="text-3xl font-bold">Hörbücher</h1>
          <p className="text-center text-ink-soft">
            Melde dich einmal an – danach bleibt das Gerät angemeldet.
          </p>
        </div>

        {linkError !== null ? (
          <Notice tone="error">
            {linkError}{' '}
            <button type="button" className="underline" onClick={clearLinkError}>
              Ausblenden
            </button>
          </Notice>
        ) : null}

        {error ? <Notice tone="error">{error}</Notice> : null}

        {linkSent ? (
          <Notice>
            Wir haben dir einen Anmeldelink an <strong>{email}</strong> geschickt. Öffne ihn
            auf <em>diesem</em> Gerät.
          </Notice>
        ) : null}

        <BigButton
          variant="secondary"
          disabled={busy}
          onClick={() => void run(actions.signInWithGoogle)}
        >
          Mit Google anmelden
        </BigButton>

        <div className="flex items-center gap-4 text-ink-soft">
          <span className="h-px flex-1 bg-line" />
          oder
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <TextField
            label="E-Mail"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
            }}
          />

          {mode === 'password' ? (
            <TextField
              label="Passwort"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
              }}
            />
          ) : null}

          <BigButton type="submit" disabled={busy}>
            {mode === 'password' ? 'Anmelden' : 'Anmeldelink schicken'}
          </BigButton>
        </form>

        <button
          type="button"
          className="min-h-touch rounded-tile px-4 text-ink-soft underline"
          onClick={() => {
            setMode(mode === 'password' ? 'link' : 'password')
            setError(null)
            setLinkSent(false)
          }}
        >
          {mode === 'password'
            ? 'Lieber einen Link per E-Mail'
            : 'Lieber mit Passwort anmelden'}
        </button>
      </div>
    </Screen>
  )
}
