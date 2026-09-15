import { describe, expect, it } from 'vitest'

import { historyId, parseHistoryEntry, summarizeByProfile, topBooks } from './history'

function entry(overrides: Record<string, unknown> = {}) {
  return parseHistoryEntry('id', {
    uid: 'u1',
    profileId: 'p1',
    profileName: 'Emma',
    bookId: 'b_1',
    bookTitle: 'Der Super-Papagei',
    plays: 3,
    secondsListened: 1800,
    lastPlayedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  })!
}

describe('historyId', () => {
  it('führt zwei Geräte auf dasselbe Dokument', () => {
    // Sonst zählte jedes Tablet für sich, und „wie oft" wäre wertlos.
    expect(historyId('u1', 'p1', 'b_1')).toBe(historyId('u1', 'p1', 'b_1'))
    expect(historyId('u1', 'p1', 'b_1')).not.toBe(historyId('u1', 'p2', 'b_1'))
  })
})

describe('parseHistoryEntry', () => {
  it('verwirft, was kein Eintrag ist', () => {
    expect(parseHistoryEntry('id', null)).toBeNull()
    expect(parseHistoryEntry('id', { profileName: 'Emma' })).toBeNull()
  })

  it('macht aus fehlenden Zahlen keine NaN', () => {
    const gelesen = entry({ plays: 'viel', secondsListened: -5 })
    expect(gelesen.plays).toBe(0)
    expect(gelesen.secondsListened).toBe(0)
  })
})

describe('summarizeByProfile', () => {
  it('fasst je Profil zusammen und stellt den fleissigsten voran', () => {
    const summary = summarizeByProfile([
      entry({ bookId: 'b_1', plays: 2, secondsListened: 600 }),
      entry({ bookId: 'b_2', plays: 5, secondsListened: 1200 }),
      entry({ profileId: 'p2', profileName: 'Ben', plays: 1, secondsListened: 100 }),
    ])

    expect(summary.map((eintrag) => eintrag.profileName)).toEqual(['Emma', 'Ben'])
    expect(summary[0]?.plays).toBe(7)
    expect(summary[0]?.secondsListened).toBe(1800)
    expect(summary[0]?.books).toBe(2)
    // Das meistgehörte Buch steht in der Liste oben.
    expect(summary[0]?.top[0]?.bookId).toBe('b_2')
  })

  it('nimmt den zuletzt geschriebenen Namen', () => {
    // Ein umbenanntes Profil stünde sonst mit seinem alten Namen da.
    const summary = summarizeByProfile([
      entry({ profileName: 'Emmi', lastPlayedAt: '2026-01-01T00:00:00.000Z' }),
      entry({ bookId: 'b_2', profileName: 'Emma', lastPlayedAt: '2026-06-01T00:00:00.000Z' }),
    ])

    expect(summary[0]?.profileName).toBe('Emma')
  })
})

describe('topBooks', () => {
  it('sortiert nach Häufigkeit über alle Profile', () => {
    const top = topBooks(
      [
        entry({ bookId: 'b_1', plays: 1 }),
        entry({ bookId: 'b_2', profileName: 'Ben', plays: 9 }),
      ],
      1,
    )

    expect(top.map((buch) => buch.bookId)).toEqual(['b_2'])
  })
})
