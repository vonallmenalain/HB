import { describe, expect, it } from 'vitest'

import {
  FADE_FLOOR,
  FADE_SECONDS,
  SLEEP_MINUTES,
  type SleepMode,
  armSleep,
  fadeVolume,
  holdSleep,
  resumeSleep,
  sleepLabel,
  sleepRemainingSec,
} from './sleepTimer'

const T0 = 1_000_000
const minuten = (minutes: number): SleepMode => ({ kind: 'minutes', minutes })

describe('armSleep', () => {
  it('rechnet gegen die Uhr, nicht gegen einen Zähler', () => {
    // Ein `setInterval` wird gedrosselt, sobald der Bildschirm ausgeht – und
    // genau dann läuft dieser Timer.
    const timer = armSleep(minuten(15), T0)

    expect(timer.deadline).toBe(T0 + 15 * 60_000)
  })

  it('braucht für „bis Kapitelende" keine Uhr', () => {
    expect(armSleep({ kind: 'chapter' }, T0).deadline).toBeNull()
  })
})

describe('holdSleep / resumeSleep', () => {
  it('hält die Uhr an, solange nichts läuft', () => {
    // „Noch 15 Minuten hören" meint Hörzeit. Eine Pause dazwischen soll davon
    // nichts abziehen – sonst ist das Kapitel zu Ende, bevor das Kind
    // eingeschlafen ist.
    const timer = holdSleep(armSleep(minuten(15), T0), T0 + 5 * 60_000)

    expect(timer.heldMs).toBe(10 * 60_000)
    expect(timer.deadline).toBeNull()
  })

  it('setzt sie später unverändert fort', () => {
    const angehalten = holdSleep(armSleep(minuten(15), T0), T0 + 5 * 60_000)
    const weiter = resumeSleep(angehalten, T0 + 60 * 60_000)

    expect(sleepRemainingSec(weiter, T0 + 60 * 60_000, 0)).toBe(600)
  })

  it('lässt sich nicht zweimal anhalten', () => {
    const einmal = holdSleep(armSleep(minuten(15), T0), T0 + 5 * 60_000)

    expect(holdSleep(einmal, T0 + 99 * 60_000)).toBe(einmal)
  })

  it('lässt „bis Kapitelende" unberührt', () => {
    const timer = armSleep({ kind: 'chapter' }, T0)

    expect(resumeSleep(holdSleep(timer, T0), T0 + 1000)).toEqual(timer)
  })
})

describe('sleepRemainingSec', () => {
  it('zählt herunter', () => {
    expect(sleepRemainingSec(armSleep(minuten(10), T0), T0 + 4 * 60_000, 0)).toBe(360)
  })

  it('bleibt bei null stehen statt ins Minus zu laufen', () => {
    expect(sleepRemainingSec(armSleep(minuten(10), T0), T0 + 99 * 60_000, 0)).toBe(0)
  })

  it('richtet sich bei „bis Kapitelende" nach der Stelle im Buch', () => {
    expect(sleepRemainingSec(armSleep({ kind: 'chapter' }, T0), T0 + 99_000, 42)).toBe(42)
  })
})

describe('fadeVolume', () => {
  it('lässt die Lautstärke bis kurz vor Schluss in Ruhe', () => {
    expect(fadeVolume(FADE_SECONDS)).toBe(1)
    expect(fadeVolume(600)).toBe(1)
  })

  it('blendet über die letzten Sekunden sanft aus', () => {
    const halb = fadeVolume(FADE_SECONDS / 2)

    expect(halb).toBeLessThan(1)
    expect(halb).toBeGreaterThan(FADE_FLOOR)
  })

  it('wird nie stumm', () => {
    // Eine Lautstärke von 0 stufen Browser als „spielt nicht" ein und beenden
    // die Hintergrundwiedergabe. Ausgeblendet wird deshalb nur bis zu einem
    // Rest – danach folgt eine echte Pause.
    //
    // Geprüft wird gegen die Zahl 0, nicht gegen `FADE_FLOOR`: Sonst würde der
    // Test die Regel mit sich selbst vergleichen und bliebe grün, wenn jemand
    // die Untergrenze auf 0 setzt.
    expect(fadeVolume(0)).toBeGreaterThan(0)
    expect(fadeVolume(-5)).toBeGreaterThan(0)
    expect(FADE_FLOOR).toBeGreaterThan(0)
  })

  it('fällt monoton', () => {
    const werte = [20, 15, 10, 5, 1, 0].map(fadeVolume)

    for (let i = 1; i < werte.length; i += 1) {
      expect(werte[i]!).toBeLessThanOrEqual(werte[i - 1]!)
    }
  })
})

describe('Auswahl', () => {
  it('bietet die im Konzept festgelegten Stufen', () => {
    expect([...SLEEP_MINUTES]).toEqual([5, 10, 15, 30, 45, 60])
  })

  it('beschriftet beide Arten verständlich', () => {
    expect(sleepLabel(minuten(30))).toBe('30 Minuten')
    expect(sleepLabel({ kind: 'chapter' })).toBe('Bis zum Kapitelende')
  })
})
