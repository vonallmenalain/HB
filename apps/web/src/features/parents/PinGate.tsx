import { type ReactNode, useState } from 'react'

import { useAuth } from '@/features/auth/authContext'
import { BigButton, BigLinkButton } from '@/ui/BigButton'
import { Screen, ScreenTitle } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'

import { PinPad } from './PinPad'
import { useParents } from './parentsContext'

/**
 * Das Schloss vor dem Elternbereich.
 *
 * Ohne gesetzte PIN steht hier nichts im Weg: Niemand soll vor einer Tür
 * stehen, die er nie abgeschlossen hat.
 *
 * „Auf diesem Gerät merken" ist für das eigene Telefon gedacht – dort ist die
 * PIN eine Hürde ohne Zweck, denn wer das Telefon entsperrt hat, ist ohnehin
 * schon drin. Auf dem Kindertablett bleibt das Häkchen leer, und die PIN gilt
 * wie bisher bei jedem Start.
 */
export function PinGate({ children }: { children: ReactNode }) {
  const { loading, locked } = useParents()
  const { actions } = useAuth()
  const { unlock } = useParents()
  const [fehler, setFehler] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hilfe, setHilfe] = useState(false)
  const [merken, setMerken] = useState(false)

  if (loading) {
    return (
      <Screen>
        <Spinner label="Einen Moment" />
      </Screen>
    )
  }

  if (!locked) return <>{children}</>

  const pruefen = (pin: string): void => {
    setBusy(true)
    setFehler(null)
    void unlock(pin, merken)
      .then((passt) => {
        if (!passt) setFehler('Das war nicht die richtige PIN.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <Screen>
      <ScreenTitle>Eltern</ScreenTitle>

      <div className="flex flex-1 flex-col justify-center gap-8 py-6">
        <PinPad label="PIN eingeben" error={fehler} busy={busy} onComplete={pruefen} />

        {/* Das Häkchen entscheidet dieses Gerät für sich: Auf dem eigenen
            Telefon ist die PIN ein Hindernis ohne Zweck, auf dem Kindertablett
            ist sie der ganze Zweck. Deshalb steht es hier und nicht als
            Einstellung, die für alle Geräte gälte. */}
        <label className="flex min-h-touch items-center gap-3 self-center rounded-tile px-4">
          <input
            type="checkbox"
            className="size-6 accent-primary"
            checked={merken}
            onChange={(event) => {
              setMerken(event.target.checked)
            }}
          />
          <span>Auf diesem Gerät merken</span>
        </label>

        <div className="flex flex-col gap-3">
          {hilfe ? (
            <>
              <p className="text-center text-ink-soft">
                Melde dich ab und wieder an – direkt danach kommst du ohne PIN hinein und
                kannst eine neue setzen.
              </p>
              <BigButton variant="secondary" onClick={() => void actions.signOut()}>
                Abmelden
              </BigButton>
            </>
          ) : (
            <button
              type="button"
              className="min-h-touch rounded-tile text-ink-soft underline"
              onClick={() => {
                setHilfe(true)
              }}
            >
              PIN vergessen?
            </button>
          )}

          <BigLinkButton to="/" variant="secondary">
            Zurück
          </BigLinkButton>
        </div>
      </div>
    </Screen>
  )
}
