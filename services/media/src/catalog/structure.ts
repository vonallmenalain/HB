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
import type { FolderMode } from './settings.js'

/**
 * Ordnernamen, die nichts über den Inhalt sagen: `CD1`, `Teil 2`, `01`.
 *
 * Vierstellige Zahlen bleiben aussen vor – `2019` unter „Adventskalender" ist
 * eine Jahresangabe und damit sehr wohl eine Aussage.
 */
export function isDiscFolder(name: string): boolean {
  return /^(cd|disc|disk|teil|part|folge|track)?[\s._-]*\d{1,3}$/i.test(name.trim())
}

/** Ein Ordner als Teil eines Werks, zerlegt. */
export interface PartName {
  /** Was neben der Teilangabe im Namen steht – meist nichts. */
  rest: string
  number: number
}

/**
 * Die Teilangabe in einem Ordnernamen, samt allem, was daneben steht.
 *
 * Verlangt wird das Wort: `CD`, `Disc`, `Teil`, `Part`, `Seite`. Die blosse
 * Zahl (`01`, `02`) reicht nicht – so legen manche Sammlungen ihre Folgen ab,
 * und aus zwanzig Folgen dürfte nie ein Buch werden. `Folge 1` ist aus
 * demselben Grund kein Teil, sondern eine Folge.
 *
 * Drumherum darf stehen, was will: `Feuerkelch CD 3`, `CD 3 von 20`. Der Rest
 * kommt zurück, weil erst der Vergleich mit den Nachbarordnern etwas darüber
 * sagt (siehe {@link isSplitAcrossParts}).
 */
export function partName(name: string): PartName | null {
  const match =
    /^(.*?)[\s._-]*\b(?:cds?|discs?|disks?|teil|part|seite)[\s._-]*(\d{1,3})(?:[\s._-]*(?:von|of)[\s._-]*\d{1,3})?[\s._-]*(.*)$/i.exec(
      name.trim(),
    )
  if (match === null) return null

  const [, davor = '', ziffern = '', danach = ''] = match
  return {
    rest: `${davor} ${danach}`.trim().replace(/\s+/g, ' ').toLowerCase(),
    number: Number(ziffern),
  }
}

/**
 * Welche dieser Unterordner sind zusammen ein Buch? Sonst nichts.
 *
 * Gezählt wird nur, was sich ausschliesslich in der Nummer unterscheidet:
 * `CD 1` … `CD 20` gehören zusammen, `CD 1 - Anfang` und `CD 2 - Das Ende`
 * erzählen jeder für sich etwas. Alles andere daneben – ein `Bonus`, ein
 * `Booklet`, ein Vorschauordner des NAS – bleibt unangetastet und geht seinen
 * eigenen Weg; vor dieser Unterscheidung blieben zwanzig CDs zwanzig Bücher,
 * sobald ein einziger Ordner danebenlag.
 *
 * Bei zwei verschiedenen Sorten von Teilen (`Stein CD 1`, `Kelch CD 1`) liegen
 * hier zwei Werke. Welche Datei zu welchem gehört, liesse sich zwar raten – nur
 * hätten beide Bücher denselben Ordner und damit dieselbe Kennung. Dann lieber
 * nichts zusammenfassen.
 */
export function partsOfOneBook(subdirectories: readonly string[]): string[] {
  const nachRest = new Map<string, string[]>()

  for (const name of subdirectories) {
    const part = partName(name)
    if (part === null) continue
    const teile = nachRest.get(part.rest)
    if (teile) teile.push(name)
    else nachRest.set(part.rest, [name])
  }

  if (nachRest.size !== 1) return []

  // Ein einzelner `CD1`-Ordner ist ein anderer Fall: Dort wird der Ordner
  // übersprungen, das Buch erscheint unter dem Namen darüber (siehe `scan.ts`).
  const teile = [...nachRest.values()][0] ?? []
  return teile.length >= 2 ? teile : []
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
export function splitsIntoEpisodes(
  override: BookOverride | null,
  fromAdmin?: FolderMode,
): boolean {
  // Der Adminbereich schlägt die `buch.json`: Was dort eingestellt wurde, lässt
  // sich dort auch wieder zurücknehmen – an die Datei auf dem NAS kommt nicht
  // jeder heran.
  if (fromAdmin === 'einzelfolgen') return true
  if (fromAdmin === 'einBuch') return false
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
