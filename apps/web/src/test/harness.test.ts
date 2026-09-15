import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

/**
 * Geprüft wird der Code, nicht der Text drumherum:
 *
 * - Importpfade raus – ein Dateiname wie `ProgressProvider.tsx` sagt nichts
 *   darüber, welcher Export daraus benutzt wird.
 * - Kommentare raus – dort darf erklärt werden, warum etwas *nicht* benutzt
 *   wird, ohne dass diese Prüfung anschlägt.
 */
const harness = readFileSync(join(process.cwd(), 'src', 'harness.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '')
  .replace(/from\s+'[^']*'/g, '')

/**
 * Die Vorschau läuft ohne Anmeldung – und lässt sich genau deshalb nicht im
 * Test rendern: Sie startet beim Import ihren eigenen React-Baum.
 *
 * Diese Prüfung ersetzt das, was ein Rendern gezeigt hätte. Sie steht hier,
 * weil der Fehler schon einmal passiert ist: Ein Provider holt sich das
 * angemeldete Konto über `useUser()` und wirft ohne Anmeldung – die Vorschau
 * bleibt weiss, ohne dass Lint, Typen oder Tests etwas merken.
 */
const NUR_MIT_ANMELDUNG = ['AuthProvider', 'ProfileProvider', 'LibraryProvider', 'ProgressProvider']

describe('Vorschau ohne Anmeldung', () => {
  it.each(NUR_MIT_ANMELDUNG)('benutzt %s nicht', (component) => {
    expect(harness).not.toMatch(new RegExp(`\\b${component}\\b`))
  })

  it('nimmt für den Fortschritt die anmeldungsfreie Variante', () => {
    expect(harness).toMatch(/\bProgressStore\b/)
  })
})
