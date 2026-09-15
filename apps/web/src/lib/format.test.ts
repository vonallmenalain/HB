import { describe, expect, it } from 'vitest'

import {
  FINISHED_THRESHOLD,
  formatCountdown,
  formatRemaining,
  formatTime,
  isFinished,
  progressRatio,
} from './format'

describe('formatTime', () => {
  it('formatiert unter einer Stunde ohne führende Null', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(9)).toBe('0:09')
    expect(formatTime(754)).toBe('12:34')
  })

  it('ergänzt die Stunde und füllt die Minuten auf', () => {
    expect(formatTime(3600)).toBe('1:00:00')
    expect(formatTime(3754)).toBe('1:02:34')
    expect(formatTime(36000)).toBe('10:00:00')
  })

  it('fängt NaN und negative Werte ab', () => {
    // `audio.duration` ist NaN, solange keine Metadaten geladen sind.
    expect(formatTime(Number.NaN)).toBe('0:00')
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00')
    expect(formatTime(-30)).toBe('0:00')
  })

  it('schneidet Nachkommastellen ab statt zu runden', () => {
    // 59,9 s darf nicht als 1:00 erscheinen, sonst springt die Anzeige.
    expect(formatTime(59.9)).toBe('0:59')
  })
})

describe('formatCountdown', () => {
  it('stellt ein Minus voran', () => {
    expect(formatCountdown(1102)).toBe('-18:22')
    expect(formatCountdown(0)).toBe('-0:00')
  })
})

describe('formatRemaining', () => {
  it('zählt unter einer Minute nicht herunter', () => {
    expect(formatRemaining(0)).toBe('gleich fertig')
    expect(formatRemaining(59)).toBe('gleich fertig')
  })

  it('nennt Minuten', () => {
    expect(formatRemaining(60)).toBe('noch 1 Min')
    expect(formatRemaining(1102)).toBe('noch 18 Min')
  })

  it('nennt Stunden und Minuten', () => {
    expect(formatRemaining(3600)).toBe('noch 1 Std')
    expect(formatRemaining(3900)).toBe('noch 1 Std 5 Min')
    expect(formatRemaining(7800)).toBe('noch 2 Std 10 Min')
  })
})

describe('progressRatio', () => {
  it('rechnet den Anteil aus', () => {
    expect(progressRatio(50, 100)).toBe(0.5)
  })

  it('begrenzt auf 0 bis 1', () => {
    expect(progressRatio(-10, 100)).toBe(0)
    expect(progressRatio(200, 100)).toBe(1)
  })

  it('liefert 0 statt NaN, wenn die Dauer unbekannt ist', () => {
    expect(progressRatio(50, 0)).toBe(0)
    expect(progressRatio(50, Number.NaN)).toBe(0)
  })
})

describe('isFinished', () => {
  it('gilt ab der Schwelle aus dem Konzept', () => {
    expect(FINISHED_THRESHOLD).toBe(0.97)
    expect(isFinished(96, 100)).toBe(false)
    expect(isFinished(97, 100)).toBe(true)
    expect(isFinished(100, 100)).toBe(true)
  })
})
