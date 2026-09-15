import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

/**
 * Prüft die Content-Security-Policy aus `netlify.toml`.
 *
 * Diese Regeln greifen nur in der echten Auslieferung – `vite preview` setzt
 * keine Netlify-Header. Eine zu enge Policy fällt deshalb lokal nie auf,
 * sondern erst, wenn im Betrieb die Google-Anmeldung stumm scheitert. Darum
 * steht der Vertrag hier als Test.
 */
const toml = readFileSync(join(process.cwd(), '..', '..', 'netlify.toml'), 'utf8')

const raw = /Content-Security-Policy\s*=\s*"""([\s\S]*?)"""/.exec(toml)?.[1] ?? ''
// Zeilenfortsetzungen im mehrzeiligen TOML-String auflösen.
const csp = raw.replace(/\\\s*\n\s*/g, ' ').trim()

const directives = new Map(
  csp
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...values] = part.split(/\s+/)
      return [name ?? '', values] as const
    }),
)

describe('Content-Security-Policy', () => {
  it('ist überhaupt gesetzt und einzeilig', () => {
    expect(csp).not.toBe('')
    expect(csp).not.toContain('\n')
    expect(directives.get('default-src')).toEqual(["'self'"])
  })

  it('erlaubt das Skript, das Firebase Auth für die Anmeldung nachlädt', () => {
    // Der Firebase-Chunk enthält https://apis.google.com/js/api.js als
    // gapiScript; ohne diese Freigabe scheitert signInWithPopup.
    expect(directives.get('script-src')).toContain('https://apis.google.com')
  })

  it('erlaubt den unsichtbaren Auth-iframe', () => {
    // Firebase Auth bettet <authDomain>/__/auth/iframe ein. Ohne frame-src
    // greift default-src 'self' und blockiert ihn.
    const frameSrc = directives.get('frame-src') ?? []
    expect(frameSrc).toContain("'self'")
    expect(frameSrc.some((value) => value.endsWith('.firebaseapp.com'))).toBe(true)
  })

  it('lässt Audio und Cover vom Medien-Dienst zu', () => {
    for (const directive of ['media-src', 'img-src', 'connect-src']) {
      expect(
        (directives.get(directive) ?? []).some((value) => value.includes('hb-media')),
        `${directive} kennt den Medien-Host nicht`,
      ).toBe(true)
    }
    expect(directives.get('media-src')).toContain('blob:')
  })

  it('bleibt bei den Grundriegeln', () => {
    expect(directives.get('object-src')).toEqual(["'none'"])
    expect(directives.get('frame-ancestors')).toEqual(["'none'"])
    expect(directives.get('base-uri')).toEqual(["'self'"])
    // Keine pauschale Google-Freigabe – nur die benannten Dienste.
    expect(csp).not.toContain('*.googleapis.com')
  })
})
