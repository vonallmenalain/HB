import { useEffect, useState } from 'react'

import { formatTime } from '@/lib/format'
import { BigButton } from '@/ui/BigButton'

import { usePlayer } from './playerContext'
import { SLEEP_MINUTES, type SleepMode } from './sleepTimer'

/**
 * Der Einschlaf-Timer im Player.
 *
 * Laut Konzept das wichtigste Elternfeature – und bedient wird er von Eltern,
 * nicht vom Kind. Deshalb steht hier Text und nicht nur ein Symbol, und
 * deshalb ist die laufende Restzeit gross: Sie ist die Antwort auf „wie lange
 * noch, bis Ruhe ist".
 */
export function SleepTimerButton() {
  const { sleepMode, sleepRemainingSec, setSleep } = usePlayer()
  const [offen, setOffen] = useState(false)

  const schliessen = (): void => {
    setOffen(false)
  }

  const waehlen = (mode: SleepMode | null): void => {
    setSleep(mode)
    setOffen(false)
  }

  // Escape schliesst – wer mit Tastatur bedient, käme sonst nur über die
  // Knöpfe wieder heraus.
  useEffect(() => {
    if (!offen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOffen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [offen])

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOffen((vorher) => !vorher)
        }}
        aria-expanded={offen}
        aria-label={
          sleepMode === null
            ? 'Einschlaf-Timer stellen'
            : `Einschlaf-Timer: noch ${formatTime(sleepRemainingSec)}`
        }
        className={`flex min-h-touch items-center gap-2 rounded-tile px-4 text-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          sleepMode === null ? 'text-ink-soft' : 'bg-surface font-semibold tabular-nums'
        }`}
      >
        <span aria-hidden="true" className="text-2xl">
          🌙
        </span>
        <span aria-hidden="true">
          {sleepMode === null ? 'Timer' : formatTime(sleepRemainingSec)}
        </span>
      </button>

      {offen ? (
        <>
          {/* Daneben tippen schliesst. Für ein Kind, das versehentlich
              hierherkommt, ist das der naheliegendste Ausweg. */}
          <button
            type="button"
            aria-label="Einschlaf-Timer schliessen"
            onClick={schliessen}
            className="fixed inset-0 z-10 cursor-default bg-ink/20"
          />

          <div
            role="dialog"
            aria-label="Einschlaf-Timer"
            className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-2xl rounded-t-tile border-t-2 border-line bg-surface p-4 shadow-lg"
          >
            <h2 className="pb-3 text-xl font-bold">Einschlaf-Timer</h2>

            <div className="grid grid-cols-3 gap-3 pb-3">
              {SLEEP_MINUTES.map((minutes) => (
                <BigButton
                  key={minutes}
                  padding="eng"
                  aria-label={`${String(minutes)} Minuten`}
                  variant={
                    sleepMode?.kind === 'minutes' && sleepMode.minutes === minutes
                      ? 'primary'
                      : 'secondary'
                  }
                  onClick={() => {
                    waehlen({ kind: 'minutes', minutes })
                  }}
                >
                  {minutes} Min
                </BigButton>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <BigButton
                variant={sleepMode?.kind === 'chapter' ? 'primary' : 'secondary'}
                onClick={() => {
                  waehlen({ kind: 'chapter' })
                }}
              >
                Bis zum Kapitelende
              </BigButton>

              {sleepMode !== null ? (
                <BigButton
                  variant="secondary"
                  onClick={() => {
                    waehlen(null)
                  }}
                >
                  Timer ausschalten
                </BigButton>
              ) : null}

              <BigButton variant="secondary" onClick={schliessen}>
                Schliessen
              </BigButton>
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
