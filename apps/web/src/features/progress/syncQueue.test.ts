import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeProgressEntry } from '@/test/renderWithProfiles'

import { type Progress } from './progress'
import { createSyncQueue } from './syncQueue'

const INTERVAL = 30_000

function setup() {
  const written: Progress[] = []
  const queue = createSyncQueue({
    write: (progress) => written.push(progress),
    minIntervalMs: INTERVAL,
    now: () => Date.now(),
  })
  return { written, queue }
}

describe('createSyncQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schreibt den ersten Stand sofort', () => {
    const { written, queue } = setup()

    queue.push(makeProgressEntry({ positionSec: 10 }))

    expect(written).toHaveLength(1)
  })

  it('hält die folgenden zurück', () => {
    const { written, queue } = setup()

    queue.push(makeProgressEntry({ positionSec: 10 }))
    vi.advanceTimersByTime(5000)
    queue.push(makeProgressEntry({ positionSec: 15 }))
    vi.advanceTimersByTime(5000)
    queue.push(makeProgressEntry({ positionSec: 20 }))

    expect(written).toHaveLength(1)
  })

  it('schreibt am Ende der Drosselung nur den zuletzt gehörten Stand', () => {
    // Nicht drei veraltete Zwischenstände hintereinander – es zählt, wo das
    // Kind jetzt ist.
    const { written, queue } = setup()

    queue.push(makeProgressEntry({ positionSec: 10 }))
    vi.advanceTimersByTime(5000)
    queue.push(makeProgressEntry({ positionSec: 15 }))
    vi.advanceTimersByTime(5000)
    queue.push(makeProgressEntry({ positionSec: 20 }))
    vi.advanceTimersByTime(INTERVAL)

    expect(written.map((entry) => entry.positionSec)).toEqual([10, 20])
  })

  it('verliert den wartenden Stand nicht, wenn nichts mehr nachkommt', () => {
    // Beim Pausieren hört das Sichern auf. Ohne den nachlaufenden Schreibvorgang
    // bliebe die letzte Stelle für immer in der Schlange liegen.
    const { written, queue } = setup()

    queue.push(makeProgressEntry({ positionSec: 10 }))
    vi.advanceTimersByTime(1000)
    queue.push(makeProgressEntry({ positionSec: 11 }))
    vi.advanceTimersByTime(INTERVAL)

    expect(written.map((entry) => entry.positionSec)).toEqual([10, 11])
  })

  it('gibt jedem Buch seinen eigenen Takt', () => {
    // Wechselt ein Kind das Buch, soll die neue Stelle nicht warten müssen.
    const { written, queue } = setup()

    queue.push(makeProgressEntry({ bookId: 'b_1' }))
    vi.advanceTimersByTime(1000)
    queue.push(makeProgressEntry({ bookId: 'b_2' }))

    expect(written.map((entry) => entry.bookId)).toEqual(['b_1', 'b_2'])
  })

  it('schreibt nach Ablauf der Drosselung wieder sofort', () => {
    const { written, queue } = setup()

    queue.push(makeProgressEntry({ positionSec: 10 }))
    vi.advanceTimersByTime(INTERVAL + 1)
    queue.push(makeProgressEntry({ positionSec: 60 }))

    expect(written.map((entry) => entry.positionSec)).toEqual([10, 60])
  })

  it('schreibt beim Leeren sofort', () => {
    // Beim Wegwischen der App bleibt keine Zeit mehr zu warten.
    const { written, queue } = setup()

    queue.push(makeProgressEntry({ positionSec: 10 }))
    vi.advanceTimersByTime(1000)
    queue.push(makeProgressEntry({ positionSec: 11 }))
    queue.flush()

    expect(written.map((entry) => entry.positionSec)).toEqual([10, 11])
  })

  it('schreibt beim Leeren nichts doppelt', () => {
    const { written, queue } = setup()

    queue.push(makeProgressEntry({ positionSec: 10 }))
    vi.advanceTimersByTime(1000)
    queue.push(makeProgressEntry({ positionSec: 11 }))
    queue.flush()
    vi.advanceTimersByTime(INTERVAL * 2)

    expect(written).toHaveLength(2)
  })

  it('tut beim Leeren nichts, wenn nichts wartet', () => {
    const { written, queue } = setup()

    queue.flush()

    expect(written).toEqual([])
  })
})
