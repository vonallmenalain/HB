import { useState } from 'react'

import { BigButton } from '@/ui/BigButton'

import { PIN_LENGTH } from './pin'

/**
 * Ziffernblock für die Eltern-PIN.
 *
 * Eine eigene Tastatur statt eines Textfelds: Auf Android schiebt sich sonst
 * die Systemtastatur über den halben Bildschirm, und die Ziffern liegen dort
 * für vier Eingaben zu klein. Hier ist jede Taste ein reguläres Touch-Ziel.
 */
export function PinPad({
  label,
  hint,
  error,
  busy = false,
  onComplete,
}: {
  label: string
  hint?: string | undefined
  error?: string | null | undefined
  busy?: boolean | undefined
  onComplete: (pin: string) => void
}) {
  const [pin, setPin] = useState('')

  const tippen = (ziffer: string): void => {
    if (busy || pin.length >= PIN_LENGTH) return
    const next = pin + ziffer
    setPin(next)
    if (next.length === PIN_LENGTH) {
      // Leeren, damit die nächste Eingabe von vorn beginnt – bei falscher PIN
      // ebenso wie bei richtiger.
      setPin('')
      onComplete(next)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className="text-2xl font-bold">{label}</h2>

      <div className="flex gap-4" role="status" aria-label={`${String(pin.length)} von ${String(PIN_LENGTH)} Ziffern`}>
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={`size-5 rounded-full border-2 border-control ${
              index < pin.length ? 'bg-primary' : 'bg-surface-sunken'
            }`}
          />
        ))}
      </div>

      {error != null && error !== '' ? (
        <p role="alert" className="text-center text-accent">
          {error}
        </p>
      ) : null}
      {hint != null && hint !== '' ? <p className="text-center text-ink-soft">{hint}</p> : null}

      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((ziffer) => (
          <BigButton
            key={ziffer}
            variant="secondary"
            padding="eng"
            disabled={busy}
            onClick={() => {
              tippen(ziffer)
            }}
          >
            {ziffer}
          </BigButton>
        ))}
        <BigButton
          variant="secondary"
          padding="eng"
          aria-label="Letzte Ziffer löschen"
          disabled={busy || pin.length === 0}
          onClick={() => {
            setPin((vorher) => vorher.slice(0, -1))
          }}
        >
          <span aria-hidden="true">←</span>
        </BigButton>
        <BigButton
          variant="secondary"
          padding="eng"
          disabled={busy}
          onClick={() => {
            tippen('0')
          }}
        >
          0
        </BigButton>
      </div>
    </div>
  )
}
