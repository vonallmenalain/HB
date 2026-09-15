import { useState } from 'react'

import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'

import { PinPad } from './PinPad'
import { useParents } from './parentsContext'
import { checkPin } from './pin'

type Schritt = 'aus' | 'neu' | 'wiederholen'

/**
 * PIN setzen, ändern, entfernen – im Elternbereich selbst.
 *
 * Die Einordnung steht ausdrücklich dabei. Eine vierstellige PIN klingt nach
 * Sicherheit, und das wäre ein falsches Versprechen: Sie hält ein Kind auf,
 * niemanden sonst.
 */
export function PinSection() {
  const { hasPin, setPin, removePin } = useParents()
  const [schritt, setSchritt] = useState<Schritt>('aus')
  const [erste, setErste] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [erledigt, setErledigt] = useState<string | null>(null)

  const abbrechen = (): void => {
    setSchritt('aus')
    setErste('')
    setFehler(null)
  }

  const ersteEingabe = (pin: string): void => {
    const problem = checkPin(pin)
    if (problem !== null) {
      setFehler(problem)
      return
    }
    setErste(pin)
    setFehler(null)
    setSchritt('wiederholen')
  }

  const zweiteEingabe = (pin: string): void => {
    if (pin !== erste) {
      setFehler('Die beiden Eingaben waren nicht gleich.')
      setSchritt('neu')
      setErste('')
      return
    }
    void setPin(pin).then(() => {
      abbrechen()
      setErledigt('PIN gespeichert.')
    })
  }

  return (
    <section className="flex flex-col gap-4 pt-8">
      <h2 className="text-2xl font-bold">Eltern-PIN</h2>

      {hasPin ? null : (
        <Notice tone="error">
          Ohne PIN steht dieser Bereich jedem offen, der auf das Profilbild tippt – auch
          den Kindern. Vier Ziffern genügen.
        </Notice>
      )}

      <Notice>
        Die PIN hält ein Kind vom Elternbereich fern – mehr nicht. Wer das Gerät in der Hand
        hat, ist ohnehin angemeldet. Vergessen ist sie kein Problem: Nach dem nächsten
        Anmelden geht es einmal ohne.
      </Notice>

      {erledigt !== null ? <Notice>{erledigt}</Notice> : null}

      {schritt === 'aus' ? (
        <div className="flex flex-col gap-3">
          <BigButton
            variant="secondary"
            onClick={() => {
              setErledigt(null)
              setFehler(null)
              setSchritt('neu')
            }}
          >
            {hasPin ? 'PIN ändern' : 'PIN einrichten'}
          </BigButton>

          {hasPin ? (
            <BigButton
              variant="secondary"
              onClick={() => {
                void removePin().then(() => {
                  setErledigt('PIN entfernt. Der Elternbereich steht jetzt offen.')
                })
              }}
            >
              PIN entfernen
            </BigButton>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-tile bg-surface p-4">
          <PinPad
            label={schritt === 'neu' ? 'Neue PIN' : 'Noch einmal'}
            hint={schritt === 'neu' ? 'Vier Ziffern, die ein Kind nicht errät.' : undefined}
            error={fehler}
            onComplete={schritt === 'neu' ? ersteEingabe : zweiteEingabe}
          />
          <BigButton variant="secondary" onClick={abbrechen}>
            Abbrechen
          </BigButton>
        </div>
      )}
    </section>
  )
}
