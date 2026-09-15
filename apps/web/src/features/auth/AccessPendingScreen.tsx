import { useState } from 'react'

import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'
import { Screen, ScreenTitle } from '@/ui/Screen'

import { useAuth } from './authContext'

/**
 * Angemeldet, aber noch nicht freigegeben.
 *
 * Bis M8 stand hier eine UID zum Abschreiben, die jemand von Hand in die
 * Firebase-Konsole tippen musste – der einzige Schritt in der ganzen App, der
 * einen Rechner verlangte. Jetzt liegt die Anfrage schon beim Administrator,
 * und hier steht nur noch, dass man kurz warten muss.
 *
 * Die UID erscheint nur, wenn das Ablegen scheitert. Dann ist sie kein
 * Umweg, sondern die einzige Angabe, mit der sich das Problem lösen lässt.
 */
export function AccessPendingScreen({
  uid,
  email,
  requested,
}: {
  uid: string
  email: string | null
  requested: boolean
}) {
  const { actions } = useAuth()
  const [pruefend, setPruefend] = useState(false)

  return (
    <Screen>
      <ScreenTitle>{requested ? 'Gleich geht’s los' : 'Noch kein Zugriff'}</ScreenTitle>

      <div className="flex flex-col gap-4">
        {requested ? (
          <Notice>
            Deine Anfrage ist unterwegs. Sobald sie im Adminbereich freigegeben ist, tippe auf
            „Nochmal prüfen“ – dann bist du drin.
          </Notice>
        ) : (
          <Notice tone="error">
            Dieses Konto ist angemeldet, aber nicht freigeschaltet – und die Anfrage liess sich
            gerade nicht ablegen. Prüfe die Internetverbindung und versuche es noch einmal.
          </Notice>
        )}

        {email !== null ? <p className="text-ink-soft">Angemeldet als {email}</p> : null}

        <BigButton
          disabled={pruefend}
          onClick={() => {
            setPruefend(true)
            void actions.recheckAccess().finally(() => {
              setPruefend(false)
            })
          }}
        >
          Nochmal prüfen
        </BigButton>

        <BigButton variant="secondary" onClick={() => void actions.signOut()}>
          Abmelden
        </BigButton>

        {!requested ? (
          <div className="rounded-tile border-2 border-line bg-surface-sunken p-4">
            <p className="pb-1 font-semibold text-ink-soft">
              Für die Fehlersuche: Kennung (UID)
            </p>
            <p className="font-mono text-sm break-all select-all">{uid}</p>
          </div>
        ) : null}
      </div>
    </Screen>
  )
}
