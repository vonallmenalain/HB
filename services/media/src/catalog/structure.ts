/**
 * Wann ist ein Ordner ein Buch – und wann mehrere?
 *
 * Gewachsene Sammlungen legen dasselbe auf drei Arten ab: ein Ordner je Folge,
 * eine Folge über zwanzig `CD`-Ordner verteilt, oder neunzig Folgen als neunzig
 * Dateien in einem einzigen Ordner. Die Entscheidungen darüber stehen hier als
 * reine Funktionen – ohne Dateizugriff, damit sie sich prüfen lassen, ohne eine
 * Bibliothek anzulegen.
 */
import type { BookOverride } from './build.js'

/**
 * Ordnernamen, die nichts über den Inhalt sagen: `CD1`, `Teil 2`, `01`.
 *
 * Vierstellige Zahlen bleiben aussen vor – `2019` unter „Adventskalender" ist
 * eine Jahresangabe und damit sehr wohl eine Aussage.
 */
export function isDiscFolder(name: string): boolean {
  return /^(cd|disc|disk|teil|part|folge|track)?[\s._-]*\d{1,3}$/i.test(name.trim())
}

/**
 * Ein benannter Teil eines Werks: `CD 1`, `Disc 03`, `Teil 2`.
 *
 * Strenger als {@link isDiscFolder}, weil daraus etwas anderes folgt: Mehrere
 * solche Ordner nebeneinander werden zu **einem** Buch zusammengefasst. Die
 * blosse Zahl (`01`, `02`) reicht dafür nicht – so legen manche Sammlungen ihre
 * Folgen ab, und aus zwanzig Folgen dürfte nie ein Buch werden. `Folge 1` ist
 * aus demselben Grund kein Teil, sondern eine Folge.
 */
export function isPartFolder(name: string): boolean {
  return /^(cd|disc|disk|teil|part)[\s._-]*\d{1,3}$/i.test(name.trim())
}

/**
 * Gehören diese Unterordner zu einem einzigen Buch?
 *
 * Nur wenn alle Teile sind und es mindestens zwei sind. Ein einzelner
 * `CD1`-Ordner ist ein anderer Fall: Dort wird der Ordner übersprungen, das
 * Buch erscheint unter dem Namen darüber (siehe `scan.ts`).
 */
export function isSplitAcrossParts(subdirectories: readonly string[]): boolean {
  return subdirectories.length >= 2 && subdirectories.every(isPartFolder)
}

/**
 * Ist jede Datei in diesem Ordner ein eigenes Hörbuch?
 *
 * Der Normalfall ist nein: Ein Ordner mit MP3s ist ein Buch, jede Datei ein
 * Kapitel. Es gibt aber die andere Ablage – neunzig vollständige Folgen als
 * neunzig Dateien in einem Ordner. Als ein Buch gelesen ergibt das ein
 * Hörbuch von hundert Stunden mit neunzig „Kapiteln", und jede Folge zu finden
 * heisst, in einer Kapitelliste zu suchen.
 *
 * Unterschieden wird das **nicht** geraten, sondern angesagt: `buch.json` mit
 * `{"einzelfolgen": true}`. Eine Automatik müsste an der Dauer und am
 * Dateinamen erkennen, was gemeint ist – und läge bei einem Roman mit langen,
 * benannten Kapiteln daneben. Der Schaden wäre einseitig: Aus einem Buch
 * würden zwölf, die Reihenfolge ginge verloren, und gemerkte Stellen zeigten
 * ins Leere. Eine Datei auf dem NAS ist dagegen in einer halben Minute
 * geschrieben.
 */
export function splitsIntoEpisodes(override: BookOverride | null): boolean {
  return override?.einzelfolgen === true
}

/**
 * Was von `buch.json` für eine einzelne Folge übrig bleibt.
 *
 * Reihe, Autor oder Tags gelten für alle Folgen im Ordner – Titel und
 * Folgennummer nicht: Die stünden sonst neunzigmal gleich da. Sie kommen aus
 * dem Dateinamen.
 */
export function overrideForEpisode(override: BookOverride | null): BookOverride | null {
  if (override === null) return null
  const rest: BookOverride = { ...override }
  delete rest.title
  delete rest.seriesIndex
  return rest
}
