import { describe, expect, it } from 'vitest'

import {
  AVATARS,
  COLORS,
  type Profile,
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
        maySwitchProfile: true,
        ageYears: 8,
        blockedBooks: ['b_1'],
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      id: 'p1',
      name: 'Emma',
      avatar: '🦊',
      color: '#0369a1',
      allowDownload: true,
      maySwitchProfile: true,
      ageYears: 8,
      blockedBooks: ['b_1'],
      createdAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('liest ein Dokument aus der Zeit vor den Rechten vorsichtig', () => {
    // So sieht jedes Profil aus, das vor dieser Version angelegt wurde: ohne
    // die drei Felder. Beide Rechte müssen ausdrücklich dastehen, sonst gilt
    // die vorsichtige Antwort – der Profilwechsel bleibt zu, und bis ein Alter
    // eingetragen ist, ist alles mit Altersfreigabe verborgen.
    const alt = parseProfile('p1', { name: 'Emma' })
    expect(alt?.maySwitchProfile).toBe(false)
    expect(alt?.ageYears).toBeNull()
    expect(alt?.blockedBooks).toEqual([])
  })

  it('weist unsinnige Alter und Sperren zurück', () => {
    expect(parseProfile('p1', { name: 'Emma', ageYears: 0 })?.ageYears).toBeNull()
    expect(parseProfile('p1', { name: 'Emma', ageYears: 99 })?.ageYears).toBeNull()
    expect(parseProfile('p1', { name: 'Emma', ageYears: '8' })?.ageYears).toBeNull()
    expect(parseProfile('p1', { name: 'Emma', ageYears: 8.4 })?.ageYears).toBe(8)
    expect(
      parseProfile('p1', { name: 'Emma', blockedBooks: ['b_1', 7, '', null] })?.blockedBooks,
    ).toEqual(['b_1'])
    expect(parseProfile('p1', { name: 'Emma', blockedBooks: 'b_1' })?.blockedBooks).toEqual([])
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

/**
 * Ein Profil mit allem, was die Sortierung nicht interessiert.
 *
 * Die Felder einzeln in jedes Literal zu schreiben hiesse, sie bei jedem neuen
 * Recht in sechs Zeilen nachzutragen – und die Sortierung liest ohnehin nur
 * Kennung, Name und Zeitpunkt.
 */
function profil(werte: Pick<Profile, 'id' | 'name' | 'createdAt'>): Profile {
  return {
    avatar: '🐻',
    color: '#000000',
    allowDownload: false,
    maySwitchProfile: false,
    ageYears: null,
    blockedBooks: [],
    ...werte,
  }
}

describe('sortProfiles', () => {
  it('sortiert nach Anlagezeitpunkt', () => {
    const profiles = [
      profil({ id: 'b', name: 'Ben', createdAt: '2026-02-01' }),
      profil({ id: 'a', name: 'Emma', createdAt: '2026-01-01' }),
    ]
    expect(sortProfiles(profiles).map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('fällt bei gleichem Zeitpunkt auf den Namen zurück', () => {
    const profiles = [
      profil({ id: 'b', name: 'Ben', createdAt: '' }),
      profil({ id: 'a', name: 'Anna', createdAt: '' }),
    ]
    expect(sortProfiles(profiles).map((p) => p.name)).toEqual(['Anna', 'Ben'])
  })

  it('verändert die Eingabe nicht', () => {
    const profiles = [
      profil({ id: 'b', name: 'Ben', createdAt: '2026-02-01' }),
      profil({ id: 'a', name: 'Anna', createdAt: '2026-01-01' }),
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
