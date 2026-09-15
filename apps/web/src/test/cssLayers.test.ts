import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

// Direkt von der Platte lesen: Vitest liefert für `.css?raw` einen leeren
// String, weil es CSS im Testlauf gar nicht erst verarbeitet.
const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8')

/**
 * Regressionstest für eine Falle, die im Browser unsichtbar bleibt und in
 * normalen Komponententests nicht auffällt:
 *
 * Ungeschichtetes CSS schlägt jede Regel aus `@layer utilities`. Ein
 * `button { color: inherit }` ausserhalb von `@layer base` macht deshalb jede
 * Tailwind-Textfarbe auf jedem Knopf wirkungslos – der Knopf sieht dann
 * einfach falsch aus, ohne dass irgendetwas fehlschlägt.
 */
/** Entfernt alle `@layer ... { ... }`-Blöcke samt Inhalt. */
function stripLayerBlocks(source: string): string {
  let result = ''
  let index = 0

  while (index < source.length) {
    const start = source.indexOf('@layer', index)
    if (start === -1) {
      result += source.slice(index)
      break
    }
    result += source.slice(index, start)

    const braceStart = source.indexOf('{', start)
    if (braceStart === -1) break

    let depth = 0
    let cursor = braceStart
    for (; cursor < source.length; cursor += 1) {
      if (source[cursor] === '{') depth += 1
      else if (source[cursor] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    index = cursor + 1
  }

  return result
}

describe('index.css', () => {
  it('legt Element-Grundstile in @layer base', () => {
    expect(css).toMatch(/@layer base\s*\{/)
    // Die Selektoren müssen innerhalb der Ebene stehen.
    const unlayered = stripLayerBlocks(css)
    for (const selector of ['button', 'body', 'html']) {
      expect(
        new RegExp(`(^|[},;]|\\*/)\\s*${selector}\\s*\\{`, 'm').test(unlayered),
        `"${selector}" steht ausserhalb von @layer und würde Tailwind-Utilities schlagen`,
      ).toBe(false)
    }
  })

  it('definiert ausserhalb der Ebenen nur Custom Properties', () => {
    const unlayered = stripLayerBlocks(css)
      // `@theme` ist Tailwinds eigene Direktive und erzeugt nur Variablen.
      .replace(/@theme\s*\{[^}]*\}/g, '')

    // Übrig bleiben dürfen nur der Dark-Mode-Block und die Reduced-Motion-Regel.
    const declarations = [...unlayered.matchAll(/^\s*([a-z-]+)\s*:/gim)].map((m) => m[1])
    for (const declaration of declarations) {
      const allowed =
        declaration?.startsWith('--') === true ||
        declaration === 'animation-duration' ||
        declaration === 'animation-iteration-count' ||
        declaration === 'transition-duration'
      expect(allowed, `"${declaration ?? ''}" steht ungeschichtet ausserhalb von @layer`).toBe(
        true,
      )
    }
  })
})
