import { useState } from 'react'

import { type AccessRequest } from '@/features/auth/accessRequest'
import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'
import { Spinner } from '@/ui/Spinner'

import { useAdmin } from './adminContext'

function wer(request: { email: string | null; name: string | null; uid: string }): string {
  return request.name ?? request.email ?? request.uid
}

/**
 * Wer darf hinein.
 *
 * Meldet sich jemand mit einer fremden Adresse an, steht die Anfrage hier –
 * mit Namen und Adresse, so wie Google sie liefert. Ein Tipp auf „Freigeben“
 * legt den Eintrag in der Freigabeliste an; mehr passiert beim Freischalten
 * nicht.
 */
export function AccessSection() {
  const { loading, requests, accounts, error, approve, deny, revoke } = useAdmin()
  const [busy, setBusy] = useState<string | null>(null)
  const [entziehen, setEntziehen] = useState<string | null>(null)

  const offen = requests.filter((request) => request.status === 'pending')
  const abgelehnt = requests.filter((request) => request.status === 'denied')

  const run = (uid: string, action: () => Promise<void>): void => {
    setBusy(uid)
    void action().finally(() => {
      setBusy(null)
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Zugriffsanfragen</h2>

      {error ? (
        <Notice tone="error">
          Die Freigabeliste lässt sich gerade nicht lesen. Entweder fehlt die Verbindung, oder
          die Firestore-Regeln kennen dieses Konto noch nicht als Administrator.
        </Notice>
      ) : null}

      {loading ? <Spinner label="Anfragen werden geladen" /> : null}

      {!loading && offen.length === 0 ? (
        <Notice>Keine offenen Anfragen. Es wartet niemand.</Notice>
      ) : null}

      <ul className="flex flex-col gap-3">
        {offen.map((request: AccessRequest) => (
          <li key={request.uid} className="flex flex-col gap-3 rounded-tile bg-surface p-4">
            <div>
              <p className="text-xl font-semibold">{wer(request)}</p>
              {request.email !== null && request.name !== null ? (
                <p className="text-ink-soft">{request.email}</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <BigButton
                disabled={busy === request.uid}
                onClick={() => {
                  run(request.uid, () => approve(request))
                }}
              >
                Freigeben
              </BigButton>
              <BigButton
                variant="secondary"
                disabled={busy === request.uid}
                onClick={() => {
                  run(request.uid, () => deny(request))
                }}
              >
                Ablehnen
              </BigButton>
            </div>
          </li>
        ))}
      </ul>

      {abgelehnt.length > 0 ? (
        <details className="rounded-tile bg-surface-sunken p-4">
          <summary className="min-h-touch cursor-pointer font-semibold">
            Abgelehnt ({abgelehnt.length})
          </summary>
          <ul className="flex flex-col gap-2 pt-3">
            {abgelehnt.map((request) => (
              <li key={request.uid} className="flex items-center gap-3">
                <span className="flex-1 truncate">{wer(request)}</span>
                <button
                  type="button"
                  className="min-h-touch rounded-tile px-3 underline"
                  onClick={() => {
                    run(request.uid, () => approve(request))
                  }}
                >
                  Doch freigeben
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <h2 className="pt-4 text-2xl font-bold">Freigeschaltete Konten</h2>

      {!loading && accounts.length === 0 ? (
        <Notice>
          Noch keine Konten in der Liste. Nach der ersten Anmeldung steht hier das
          Administratorkonto.
        </Notice>
      ) : null}

      <ul className="flex flex-col gap-3">
        {accounts.map((account) => (
          <li key={account.uid} className="flex flex-col gap-2 rounded-tile bg-surface p-4">
            <div className="flex items-center gap-3">
              <span className="flex-1 truncate text-lg font-semibold">{wer(account)}</span>
              {account.admin ? (
                <span className="rounded-full bg-surface-sunken px-3 py-1 text-sm font-semibold">
                  Administrator
                </span>
              ) : null}
            </div>

            {/* Der eigene Zugang lässt sich nicht wegnehmen – sonst sperrt man
                sich mit einem Tipper aus dem Adminbereich aus. */}
            {account.admin ? null : entziehen === account.uid ? (
              <div className="flex flex-col gap-2">
                <Notice tone="error">
                  Zugriff für {wer(account)} wirklich entziehen? Die Profile und der Fortschritt
                  dieses Kontos bleiben erhalten.
                </Notice>
                <div className="flex gap-2">
                  <BigButton
                    onClick={() => {
                      run(account.uid, () => revoke(account.uid))
                      setEntziehen(null)
                    }}
                  >
                    Ja, entziehen
                  </BigButton>
                  <BigButton
                    variant="secondary"
                    onClick={() => {
                      setEntziehen(null)
                    }}
                  >
                    Abbrechen
                  </BigButton>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="min-h-touch self-start rounded-tile px-2 text-ink-soft underline"
                onClick={() => {
                  setEntziehen(account.uid)
                }}
              >
                Zugriff entziehen
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
