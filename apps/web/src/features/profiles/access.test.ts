import { describe, expect, it } from 'vitest'

import { makeBook } from '@/test/renderWithProfiles'

import {
  AGE_STEPS,
  type AccessProfile,
  ageLabel,
  mayListen,
  minAgeOf,
  parseAgeYears,
  parseMinAge,
  visibleBooks,
} from './access'

const BOOKS = [
  makeBook({ id: 'frei', title: 'Der Super-Papagei' }),
  makeBook({ id: 'ab6', title: 'Bibi Blocksberg' }),
  makeBook({ id: 'ab12', title: 'Der Feuerkelch' }),
]

const AGES = new Map([
  ['ab6', 6],
  ['ab12', 12],
])

const kind = (werte: Partial<AccessProfile> = {}): AccessProfile => ({
  ageYears: null,
  blockedBooks: [],
  ...werte,
})

describe('mayListen', () => {
  it('lässt ein Hörbuch ohne Altersfreigabe immer durch', () => {
    expect(mayListen('frei', kind(), AGES)).toBe(true)
    expect(mayListen('frei', kind({ ageYears: 3 }), AGES)).toBe(true)
  })

  it('richtet sich nach dem Alter des Kindes', () => {
    expect(mayListen('ab6', kind({ ageYears: 5 }), AGES)).toBe(false)
    expect(mayListen('ab6', kind({ ageYears: 6 }), AGES)).toBe(true)
    expect(mayListen('ab12', kind({ ageYears: 6 }), AGES)).toBe(false)
    expect(mayListen('ab12', kind({ ageYears: 14 }), AGES)).toBe(true)
  })

  it('verbirgt Hörbücher mit Freigabe, solange kein Alter gesetzt ist', () => {
    // Die vorsichtige Richtung: Wer eine Folge auf „ab 12" setzt, will sie vor
    // den Kleinen verbergen – und nicht erst noch bei jedem Profil eine Zahl
    // nachtragen müssen, damit die Freigabe überhaupt greift.
    expect(mayListen('ab12', kind(), AGES)).toBe(false)
    expect(mayListen('ab6', kind(), AGES)).toBe(false)
  })

  it('sperrt ein einzelnes Hörbuch trotz passendem Alter', () => {
    // Für die Ausnahme, für die kein Alter etwas hergibt.
    expect(mayListen('frei', kind({ ageYears: 12, blockedBooks: ['frei'] }), AGES)).toBe(false)
  })
})

describe('visibleBooks', () => {
  it('gibt ohne Profil alles heraus', () => {
    // So lesen der Eltern- und der Adminbereich die Bibliothek: Dort wird ja
    // gerade eingestellt, was ein Kind sehen soll.
    expect(visibleBooks(BOOKS, null, AGES)).toHaveLength(3)
  })

  it('lässt nur übrig, was das Kind hören darf', () => {
    const sichtbar = visibleBooks(BOOKS, kind({ ageYears: 8 }), AGES)
    expect(sichtbar.map((book) => book.id)).toEqual(['frei', 'ab6'])
  })

  it('nimmt gesperrte Hörbücher heraus', () => {
    const sichtbar = visibleBooks(BOOKS, kind({ ageYears: 16, blockedBooks: ['ab6'] }), AGES)
    expect(sichtbar.map((book) => book.id)).toEqual(['frei', 'ab12'])
  })

  it('verändert die Eingabe nicht', () => {
    const eingabe = [...BOOKS]
    visibleBooks(eingabe, kind({ ageYears: 3 }), AGES)
    expect(eingabe).toHaveLength(3)
  })

  it('kommt ohne jede Altersfreigabe mit allem durch', () => {
    expect(visibleBooks(BOOKS, kind(), new Map())).toHaveLength(3)
  })
})

describe('Werte einlesen', () => {
  it('nimmt nur brauchbare Altersfreigaben', () => {
    expect(parseMinAge(12)).toBe(12)
    expect(parseMinAge(12.4)).toBe(12)
    expect(parseMinAge(0)).toBe(0)
    expect(parseMinAge(-3)).toBe(0)
    expect(parseMinAge(99)).toBe(0)
    expect(parseMinAge('12')).toBe(0)
    expect(parseMinAge(Number.NaN)).toBe(0)
  })

  it('nimmt nur brauchbare Alter', () => {
    expect(parseAgeYears(8)).toBe(8)
    expect(parseAgeYears(1)).toBeNull()
    expect(parseAgeYears(18)).toBeNull()
    expect(parseAgeYears(null)).toBeNull()
  })

  it('jede Stufe aus der Leiter lässt sich auch wieder einlesen', () => {
    // Sonst liesse sich im Adminbereich etwas setzen, das beim Zurücklesen
    // stillschweigend zu „frei" würde.
    for (const stufe of AGE_STEPS) expect(parseMinAge(stufe)).toBe(stufe)
  })
})

describe('ageLabel', () => {
  it('sagt, was gilt', () => {
    expect(ageLabel(0)).toBe('Ohne Altersfreigabe')
    expect(ageLabel(12)).toBe('Ab 12 Jahren')
  })
})

describe('minAgeOf', () => {
  it('nimmt für ein unbekanntes Hörbuch die Null', () => {
    expect(minAgeOf(AGES, 'ab12')).toBe(12)
    expect(minAgeOf(AGES, 'gibtesnicht')).toBe(0)
  })
})
