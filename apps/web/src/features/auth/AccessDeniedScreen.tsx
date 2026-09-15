import { useState } from 'react'

import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'
import { Screen, ScreenTitle } from '@/ui/Screen'

import { useAuth } from './authContext'

/**
 * Angemeldet, aber nicht freigeschaltet.
 *
 * Anmelden kann sich grundsätzlich jeder mit einem Google-Konto – Zugriff
 * bekommt nur, wer in der Freigabeliste in Firestore steht. Dieser Bildschirm
 * zeigt die nötige Kennung an, damit sie sich in die Konsole übertragen lässt.
 */
export function AccessDeniedScreen({ uid, email }: { uid: string; email: string | null }) {
  const { actions } = useAuth()
  const [copied, setCopied] = useState(false)

  return (
    <Screen>
      <ScreenTitle>Noch kein Zugriff</ScreenTitle>

      <div className="flex flex-col gap-4">
        <Notice>
          Dieses Konto ist angemeldet, aber nicht freigeschaltet. Trage die Kennung unten in
          Firestore unter <code className="font-mono">allowlist</code> als Dokument-ID ein,
          dann lade die App neu.
        </Notice>

        {email !== null ? <p className="text-ink-soft">Angemeldet als {email}</p> : null}

        <div className="rounded-tile border-2 border-line bg-surface-sunken p-4">
          <p className="pb-1 font-semibold text-ink-soft">Kennung (UID)</p>
          <p className="font-mono text-sm break-all select-all">{uid}</p>
        </div>

        <BigButton
          variant="secondary"
          onClick={() => {
            void navigator.clipboard
              .writeText(uid)
              .then(() => {
                setCopied(true)
              })
              .catch(() => {
                // Ohne Zwischenablage bleibt die Kennung oben zum Markieren.
              })
          }}
        >
          {copied ? 'Kopiert' : 'Kennung kopieren'}
        </BigButton>

        <BigButton onClick={() => void actions.recheckAccess()}>Nochmal prüfen</BigButton>

        <BigButton variant="secondary" onClick={() => void actions.signOut()}>
          Abmelden
        </BigButton>
      </div>
    </Screen>
  )
}
