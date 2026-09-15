import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

/**
 * Kontrast ist in KONZEPT §5.5 eine verbindliche Regel – und die einzige, die
 * sich beim Ansehen nicht überprüfen lässt. Ein Farbwert sieht kräftig aus und
 * verfehlt trotzdem die Schwelle; genau das war bei der Fehlerfarbe der Fall
 * (3,6:1 statt der geforderten 4,5:1).
 *
 * Gerechnet wird deshalb hier, aus derselben Datei, aus der auch die App ihre
 * Farben nimmt. Ein neuer Farbwert, der die Regel bricht, fällt beim nächsten
 * Testlauf auf statt irgendwann jemandem im Dunkeln.
 */
const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8')

/** Die Token aus `@theme` – das helle Thema. */
function hellesThema(): Record<string, string> {
  const block = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
  return tokens(block)
}

/** Die Überschreibungen aus `prefers-color-scheme: dark`. */
function dunklesThema(): Record<string, string> {
  const block = /prefers-color-scheme:\s*dark\s*\)\s*\{\s*:root\s*\{([\s\S]*?)\n\s*\}/.exec(css)?.[1] ?? ''
  return { ...hellesThema(), ...tokens(block) }
}

function tokens(block: string): Record<string, string> {
  const gefunden: Record<string, string> = {}
  for (const treffer of block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/gi)) {
    gefunden[treffer[1]!] = treffer[2]!
  }
  return gefunden
}

function luminanz(hex: string): number {
  const zahl = Number.parseInt(hex.slice(1), 16)
  const kanal = (wert: number): number => {
    const c = wert / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * kanal((zahl >> 16) & 255) +
    0.7152 * kanal((zahl >> 8) & 255) +
    0.0722 * kanal(zahl & 255)
  )
}

export function contrast(vorne: string, hinten: string): number {
  const a = luminanz(vorne)
  const b = luminanz(hinten)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Fliesstext: WCAG AA. */
const TEXT_AA = 4.5
/** Ränder, die ein Bedienelement überhaupt erst erkennbar machen: WCAG 1.4.11. */
const UI_AA = 3

const TEXTPAARE: [string, string][] = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['ink', 'surface-sunken'],
  ['ink-soft', 'bg'],
  ['ink-soft', 'surface'],
  ['ink-soft', 'surface-sunken'],
  ['on-primary', 'primary'],
  ['accent', 'bg'],
  ['accent', 'surface'],
  ['primary', 'bg'],
]

const THEMEN: [string, Record<string, string>][] = [
  ['hell', hellesThema()],
  ['dunkel', dunklesThema()],
]

describe('Farbkontrast (KONZEPT §5.5)', () => {
  it.each(THEMEN)('%s: alle Token sind gesetzt', (_name, thema) => {
    for (const name of ['bg', 'surface', 'surface-sunken', 'ink', 'ink-soft', 'line', 'control', 'primary', 'on-primary', 'accent']) {
      expect(thema[name], `--color-${name}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  describe.each(THEMEN)('%s', (_name, thema) => {
    it.each(TEXTPAARE)('%s auf %s erreicht WCAG AA', (vorne, hinten) => {
      expect(contrast(thema[vorne]!, thema[hinten]!)).toBeGreaterThanOrEqual(TEXT_AA)
    })

    it('Fliesstext erreicht sogar AAA', () => {
      // §5.5 nennt AAA als Ziel für Text – für die beiden Hauptflächen soll
      // es auch gehalten werden.
      expect(contrast(thema.ink!, thema.bg!)).toBeGreaterThanOrEqual(7)
      expect(contrast(thema.ink!, thema.surface!)).toBeGreaterThanOrEqual(7)
    })

    it('der Rand eines Bedienelements ist erkennbar', () => {
      // Ein sekundärer Knopf ist fast so hell wie der Hintergrund – erkannt
      // wird er an seinem Rand. Ohne Kontrast dort ist er unsichtbar.
      expect(contrast(thema.control!, thema.surface!)).toBeGreaterThanOrEqual(UI_AA)
      expect(contrast(thema.control!, thema.bg!)).toBeGreaterThanOrEqual(UI_AA)
    })
  })
})
