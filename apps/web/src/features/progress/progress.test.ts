import { describe, expect, it } from 'vitest'

import { type Book } from '@/features/library/catalog'
import { makeBook } from '@/test/renderWithProfiles'

import {
  type Progress,
  CONTINUE_MIN_SECONDS,
  makeProgress,
  pickContinue,
  progressRatio,
  resolveResume,
} from './progress'

const BOOK: Book = makeBook({
  id: 'b_1',
  durationSec: 1800,
  filesHash: 'hash-a',
  files: [
    { idx: 0, durationSec: 600, bytes: 0, mime: 'audio/mpeg' },
    { idx: 1, durationSec: 700, bytes: 0, mime: 'audio/mpeg' },
    { idx: 2, durationSec: 500, bytes: 0, mime: 'audio/mpeg' },
  ],
})

function progress(overrides: Partial<Progress> = {}): Progress {
  return {
    bookId: 'b_1',
    positionSec: 800,
    fileIdx: 1,
    offsetSec: 200,
    filesHash: 'hash-a',
    durationSec: 1800,
    finished: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('makeProgress', () => {
  it('speichert die Position doppelt', () => {
    const entry = makeProgress(BOOK, 800, 1, 200, () => new Date('2026-05-05T00:00:00.000Z'))

    expect(entry.positionSec).toBe(800)
    expect(entry.fileIdx).toBe(1)
    expect(entry.offsetSec).toBe(200)
    expect(entry.filesHash).toBe('hash-a')
    expect(entry.updatedAt).toBe('2026-05-05T00:00:00.000Z')
  })

  it('erkennt ein fertig gehörtes Buch', () => {
    // Ab 97 Prozent laut Konzept.
    expect(makeProgress(BOOK, 1700, 2, 400).finished).toBe(false)
    expect(makeProgress(BOOK, 1760, 2, 460).finished).toBe(true)
  })

  it('begrenzt unsinnige Werte', () => {
    expect(makeProgress(BOOK, -50, 0, -10).positionSec).toBe(0)
    expect(makeProgress(BOOK, 99999, 2, 500).positionSec).toBe(1800)
  })
})

describe('resolveResume', () => {
  it('beginnt ohne Fortschritt am Anfang', () => {
    expect(resolveResume(BOOK, null)).toEqual({ positionSec: 0, exact: true })
  })

  it('nimmt die exakte Stelle, solange der Katalog passt', () => {
    // 600 (Datei 1 beginnt) + 200 = 800, minus fünf Sekunden Rücksprung.
    expect(resolveResume(BOOK, progress())).toEqual({ positionSec: 795, exact: true })
  })

  it('fällt auf die globale Sekunde zurück, wenn die Dateien gewechselt haben', () => {
    // Genau der Fall nach einem Re-Encode auf dem NAS: Die exakte Stelle ist
    // nicht mehr verlässlich, die globale Sekunde schon.
    const entry = progress({ filesHash: 'hash-alt', positionSec: 1000, fileIdx: 1, offsetSec: 200 })
    expect(resolveResume(BOOK, entry)).toEqual({ positionSec: 995, exact: false })
  })

  it('behandelt einen leeren Fingerabdruck als unsicher', () => {
    const entry = progress({ filesHash: '', positionSec: 1000 })
    expect(resolveResume(BOOK, entry).exact).toBe(false)
  })

  it('springt fünf Sekunden zurück, aber nie vor den Anfang', () => {
    expect(resolveResume(BOOK, progress({ fileIdx: 0, offsetSec: 2 })).positionSec).toBe(0)
  })

  it('beginnt ein fertiges Buch wieder von vorn', () => {
    expect(resolveResume(BOOK, progress({ finished: true })).positionSec).toBe(0)
  })

  it('bleibt im Buch, wenn die gespeicherte Position zu gross ist', () => {
    const entry = progress({ filesHash: 'anders', positionSec: 99999 })
    expect(resolveResume(BOOK, entry).positionSec).toBe(1795)
  })
})

describe('progressRatio', () => {
  it('rechnet den Anteil aus', () => {
    expect(progressRatio(progress({ positionSec: 900 }))).toBe(0.5)
  })

  it('liefert 0 ohne Fortschritt und 1 bei fertigen Büchern', () => {
    expect(progressRatio(null)).toBe(0)
    expect(progressRatio(progress({ finished: true, positionSec: 10 }))).toBe(1)
  })

  it('kommt mit unbekannter Dauer klar', () => {
    expect(progressRatio(progress({ durationSec: 0 }))).toBe(0)
  })
})

describe('pickContinue', () => {
  const vorhanden = () => true

  it('nimmt das zuletzt angefasste Buch', () => {
    const chosen = pickContinue(
      [
        progress({ bookId: 'alt', updatedAt: '2026-01-01T00:00:00.000Z' }),
        progress({ bookId: 'neu', updatedAt: '2026-03-01T00:00:00.000Z' }),
      ],
      vorhanden,
    )
    expect(chosen?.bookId).toBe('neu')
  })

  it('überspringt fertige Bücher', () => {
    const chosen = pickContinue(
      [
        progress({ bookId: 'fertig', finished: true, updatedAt: '2026-09-01T00:00:00.000Z' }),
        progress({ bookId: 'laufend', updatedAt: '2026-01-01T00:00:00.000Z' }),
      ],
      vorhanden,
    )
    expect(chosen?.bookId).toBe('laufend')
  })

  it('überspringt kaum angehörte Bücher', () => {
    // Ein versehentlich angetipptes Buch gehört nicht auf die Startkachel.
    expect(
      pickContinue([progress({ positionSec: CONTINUE_MIN_SECONDS - 1 })], vorhanden),
    ).toBeNull()
    expect(
      pickContinue([progress({ positionSec: CONTINUE_MIN_SECONDS })], vorhanden),
    ).not.toBeNull()
  })

  it('senkt die Schwelle bei kurzen Geschichten', () => {
    // Bei drei Minuten wären feste 30 Sekunden ein Sechstel – die Kachel
    // bliebe gefühlt immer leer.
    const kurz = progress({ durationSec: 180, positionSec: 5 })
    expect(pickContinue([kurz], vorhanden)).not.toBeNull()

    const zuFrueh = progress({ durationSec: 180, positionSec: 2 })
    expect(pickContinue([zuFrueh], vorhanden)).toBeNull()
  })

  it('zählt Position null nie als angefangen', () => {
    expect(pickContinue([progress({ durationSec: 0, positionSec: 0 })], vorhanden)).toBeNull()
  })

  it('überspringt Bücher, die es nicht mehr gibt', () => {
    // Auf dem NAS gelöscht, Fortschritt noch da.
    expect(pickContinue([progress({ bookId: 'weg' })], (id) => id !== 'weg')).toBeNull()
  })

  it('liefert null, wenn nichts passt', () => {
    expect(pickContinue([], vorhanden)).toBeNull()
  })
})
