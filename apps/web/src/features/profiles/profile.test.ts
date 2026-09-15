import { describe, expect, it } from 'vitest'

import {
  AVATARS,
  COLORS,
  avatarFallback,
  checkProfileName,
  parseProfile,
  sortProfiles,
} from './profile'

describe('avatarFallback', () => {
  it('nimmt den ersten Buchstaben in Grossschreibung', () => {
    expect(avatarFallback('emma')).toBe('E')
    expect(avatarFallback('  ben ')).toBe('B')
  })

  it('kommt mit Umlauten und Emoji klar', () => {
    expect(avatarFallback('Örs')).toBe('Ö')
    // Ein Emoji besteht aus mehreren Code-Einheiten – `[0]` allein würde es
    // zerschneiden und Kaputtzeichen liefern.
    expect(avatarFallback('🦊 Fuchs')).toBe('🦊')
  })

  it('liefert ein Fragezeichen statt nichts', () => {
    expect(avatarFallback('')).toBe('?')
    expect(avatarFallback('   ')).toBe('?')
  })
})

describe('checkProfileName', () => {
  it('nimmt normale Namen an', () => {
    expect(checkProfileName('Emma')).toEqual({ ok: true })
  })

  it('lehnt leere Namen ab', () => {
    expect(checkProfileName('   ').ok).toBe(false)
  })

  it('lehnt zu lange Namen ab', () => {
    expect(checkProfileName('x'.repeat(21)).ok).toBe(false)
    expect(checkProfileName('x'.repeat(20)).ok).toBe(true)
  })

  it('erkennt Doppelungen unabhängig von Gross- und Kleinschreibung', () => {
    expect(checkProfileName('emma', ['Emma']).ok).toBe(false)
    expect(checkProfileName(' Emma ', ['Emma']).ok).toBe(false)
    expect(checkProfileName('Ben', ['Emma']).ok).toBe(true)
  })
})

describe('parseProfile', () => {
  it('liest ein vollständiges Dokument', () => {
    expect(
      parseProfile('p1', {
        name: 'Emma',
        avatar: '🦊',
        color: '#0369a1',
        allowDownload: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      id: 'p1',
      name: 'Emma',
      avatar: '🦊',
      color: '#0369a1',
      allowDownload: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('verwirft Dokumente ohne brauchbaren Namen', () => {
    expect(parseProfile('p1', {})).toBeNull()
    expect(parseProfile('p1', { name: '   ' })).toBeNull()
    expect(parseProfile('p1', null)).toBeNull()
    expect(parseProfile('p1', 'kaputt')).toBeNull()
  })

  it('ergänzt fehlende Felder mit sinnvollen Vorgaben', () => {
    const profile = parseProfile('p1', { name: 'Ben' })
    expect(profile).not.toBeNull()
    expect(profile?.avatar).toBe('B')
    expect(profile?.color).toBe(COLORS[0])
    expect(profile?.createdAt).toBe('')
  })

  it('lässt Downloads nur bei ausdrücklichem true zu', () => {
    // Ein versehentliches "true" als Zeichenkette darf keine Freigabe sein.
    expect(parseProfile('p1', { name: 'Ben', allowDownload: 'true' })?.allowDownload).toBe(false)
    expect(parseProfile('p1', { name: 'Ben', allowDownload: 1 })?.allowDownload).toBe(false)
    expect(parseProfile('p1', { name: 'Ben' })?.allowDownload).toBe(false)
    expect(parseProfile('p1', { name: 'Ben', allowDownload: true })?.allowDownload).toBe(true)
  })

  it('weist unsinnige Farben zurück', () => {
    expect(parseProfile('p1', { name: 'Ben', color: 'rot' })?.color).toBe(COLORS[0])
    expect(parseProfile('p1', { name: 'Ben', color: '#abc' })?.color).toBe(COLORS[0])
    expect(parseProfile('p1', { name: 'Ben', color: '#AABBCC' })?.color).toBe('#AABBCC')
  })
})

describe('sortProfiles', () => {
  it('sortiert nach Anlagezeitpunkt', () => {
    const profiles = [
      { id: 'b', name: 'Ben', avatar: '🐻', color: '#000000', allowDownload: false, createdAt: '2026-02-01' },
      { id: 'a', name: 'Emma', avatar: '🦊', color: '#000000', allowDownload: false, createdAt: '2026-01-01' },
    ]
    expect(sortProfiles(profiles).map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('fällt bei gleichem Zeitpunkt auf den Namen zurück', () => {
    const profiles = [
      { id: 'b', name: 'Ben', avatar: '🐻', color: '#000000', allowDownload: false, createdAt: '' },
      { id: 'a', name: 'Anna', avatar: '🦊', color: '#000000', allowDownload: false, createdAt: '' },
    ]
    expect(sortProfiles(profiles).map((p) => p.name)).toEqual(['Anna', 'Ben'])
  })

  it('verändert die Eingabe nicht', () => {
    const profiles = [
      { id: 'b', name: 'Ben', avatar: '🐻', color: '#000000', allowDownload: false, createdAt: '2026-02-01' },
      { id: 'a', name: 'Anna', avatar: '🦊', color: '#000000', allowDownload: false, createdAt: '2026-01-01' },
    ]
    sortProfiles(profiles)
    expect(profiles[0]?.id).toBe('b')
  })
})

describe('Vorgabewerte', () => {
  it('bietet genug Auswahl für mehrere Kinder', () => {
    expect(AVATARS.length).toBeGreaterThanOrEqual(8)
    expect(new Set(AVATARS).size).toBe(AVATARS.length)
    expect(new Set(COLORS).size).toBe(COLORS.length)
  })
})
