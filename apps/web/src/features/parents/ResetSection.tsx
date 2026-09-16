import { useState } from 'react'

import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'

import { type ResetReport, useReset } from './resetContext'

type Stand =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'running' }
  | { kind: 'done'; report: ResetReport }
  | { kind: 'failed' }

function bilanz(report: ResetReport): string {
  const teile = [
    `${String(report.progress)} ${report.progress === 1 ? 'Hörstand' : 'Hörstände'}`,
    `${String(report.favorites)} ${report.favorites === 1 ? 'Stern' : 'Sterne'}`,
  ]
  if (report.history !== null) {
    teile.push(
      `${String(report.history)} ${report.history === 1 ? 'Eintrag' : 'Einträge'} Historie`,
    )
  }
  return teile.join(', ')
}

/**
 * Elternbereich: alles auf Anfang.
 *
 * Gedacht für den Moment nach dem Ausprobieren – die Startseite soll wieder so
 * aussehen wie am ersten Tag. Mit Rückfrage, denn zurückholen lässt sich das
 * nicht.
 */
export function ResetSection() {
  const { resetAll } = useReset()
  const [stand, setStand] = useState<Stand>({ kind: 'idle' })

  function los(): void {
    setStand({ kind: 'running' })
    void resetAll().then(
      (report) => {
        setStand({ kind: 'done', report })
      },
      () => {
        setStand({ kind: 'failed' })
      },
    )
  }

  return (
    <section className="flex flex-col gap-4 pt-8">
      <h2 className="text-2xl font-bold">Zurücksetzen</h2>

      <p className="text-ink-soft">
        Setzt den Hörfortschritt aller Profile auf Anfang und löscht die gemerkten
        Hörbücher und die Hörhistorie. „Weiterhören" und „Zuletzt gehört" sind danach
        leer, die Vorschläge fangen wieder bei null an. Die Hörbücher selbst bleiben
        unangetastet – sie liegen auf dem NAS.
      </p>

      {stand.kind === 'done' ? (
        <Notice>Zurückgesetzt: {bilanz(stand.report)}.</Notice>
      ) : null}

      {stand.kind === 'failed' ? (
        <Notice tone="error">
          Das Zurücksetzen ist nicht durchgelaufen. Ein Teil kann schon zurückgesetzt
          sein – noch einmal versuchen schadet nicht.
        </Notice>
      ) : null}

      {stand.kind === 'asking' ? (
        <div className="flex flex-col gap-2">
          <Notice tone="error">
            Wirklich alles zurücksetzen? Die Hörstände aller Kinder gehen dabei verloren,
            auch die von angefangenen Hörbüchern.
          </Notice>
          <div className="flex gap-2">
            <BigButton onClick={los}>Ja, zurücksetzen</BigButton>
            <BigButton
              variant="secondary"
              onClick={() => {
                setStand({ kind: 'idle' })
              }}
            >
              Abbrechen
            </BigButton>
          </div>
        </div>
      ) : (
        <BigButton
          variant="secondary"
          disabled={stand.kind === 'running'}
          className="disabled:opacity-60"
          onClick={() => {
            setStand({ kind: 'asking' })
          }}
        >
          {stand.kind === 'running' ? 'Wird zurückgesetzt …' : 'Alles zurücksetzen'}
        </BigButton>
      )}
    </section>
  )
}
