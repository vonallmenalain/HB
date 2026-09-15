/**
 * Namensauswertung für Ordner und Dateien.
 *
 * Hörbuch-Sammlungen sind von Hand gewachsen: „01 - Kapitel“, „Kapitel 2“,
 * „track03.mp3“. Der Scanner muss daraus etwas machen, das ein Kind lesen kann.
 */

/** Sortiert so, wie Menschen es erwarten: `2` vor `10`. */
export function naturalCompare(a: string, b: string): number {
  const chunks = (value: string): (string | number)[] =>
    value
      .split(/(\d+)/)
      .filter((part) => part !== '')
      .map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()))

  const left = chunks(a)
  const right = chunks(b)

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i]
    const r = right[i]
    if (l === undefined) return -1
    if (r === undefined) return 1
    if (typeof l === 'number' && typeof r === 'number') {
      if (l !== r) return l - r
      continue
    }
    const ls = String(l)
    const rs = String(r)
    if (ls !== rs) return ls.localeCompare(rs, 'de')
  }
  return 0
}

export interface FolderName {
  title: string
  seriesIndex: number | null
}

/**
 * Wörter, die beim Vergleich zweier Namen nichts beitragen.
 *
 * „Die drei ???" und „Drei Fragezeichen" meinen dieselbe Reihe – der Artikel
 * entscheidet nichts und steht nur mal da und mal nicht.
 */
const FILLER_WORDS = new Set(['der', 'die', 'das', 'den', 'ein', 'eine', 'the', 'a', 'an'])

/** Ausgeschriebene Zahlen, wie sie in Reihennamen vorkommen: „Die drei", „Fünf Freunde". */
const NUMBER_WORDS = new Map([
  ['eins', '1'],
  ['zwei', '2'],
  ['drei', '3'],
  ['vier', '4'],
  ['funf', '5'],
  ['sechs', '6'],
  ['sieben', '7'],
  ['acht', '8'],
  ['neun', '9'],
  ['zehn', '10'],
  ['elf', '11'],
  ['zwolf', '12'],
])

interface Token {
  value: string
  /** Position hinter dem Wort im ursprünglichen Text. */
  end: number
}

/** Kleinschreibung ohne Akzente, Zahlwort als Ziffer – zum Vergleichen, nie zum Anzeigen. */
function normalizeWord(raw: string): string {
  // „Die drei ???" und „Die 3 Fragezeichen" sind dieselbe Reihe. Ohne diese
  // eine Zeile bliebe der Reihenname in jedem Ordnernamen stehen.
  if (/^\?{2,}$/.test(raw)) return 'fragezeichen'

  const plain = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
  return NUMBER_WORDS.get(plain) ?? plain
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  const pattern = /[\p{L}\p{N}]+|\?{2,}/gu
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    tokens.push({ value: normalizeWord(match[0]), end: match.index + match[0].length })
  }
  return tokens
}

/**
 * Vereinheitlicht Trennzeichen und Abstände.
 *
 * Gewachsene Sammlungen schreiben denselben Gedanken auf drei Arten:
 * „Kids-68-Chaos", „Kids - 68 - Chaos", „Kids_68_Chaos". Ein Strich zählt dabei
 * nur dann als Trenner, wenn Leerraum daneben steht oder auf einer Seite eine
 * Ziffer – sonst verlöre „Mini-Fall" seinen Bindestrich.
 */
export function tidyName(raw: string): string {
  return raw
    .replace(/_+/g, ' ')
    .replace(/\s*[–—]\s*/g, ' - ')
    .replace(/\s+-\s*/g, ' - ')
    .replace(/\s*-\s+/g, ' - ')
    .replace(/(\d)\s*-\s*(\D)/g, '$1 - $2')
    .replace(/(\D)\s*-\s*(\d)/g, '$1 - $2')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—.·:]+/, '')
    .replace(/[\s\-–—.·:]+$/, '')
    .trim()
}

/**
 * Wie weit vorn ein Reihenname stehen muss, um noch als Präfix zu zählen.
 *
 * „Die drei ??? Kids - 05 - …" beginnt mit zwei Füllwörtern, ehe die Reihe
 * kommt. Weiter hinten wäre es kein Präfix mehr, sondern ein Wort im Titel –
 * und „Der Fall der Kids" dürfte nicht zu „" zusammenschrumpfen.
 */
const MAX_LEAD_WORDS = 3

function stripOnePrefix(name: string, prefix: string): string | null {
  const wanted = tokenize(prefix)
    .map((token) => token.value)
    .filter((value) => !FILLER_WORDS.has(value))
  if (wanted.length === 0) return null

  const tokens = tokenize(name)

  for (let start = 0; start < Math.min(tokens.length, MAX_LEAD_WORDS); start += 1) {
    let index = start
    let matched = 0

    while (matched < wanted.length && index < tokens.length) {
      const token = tokens[index]!
      if (token.value === wanted[matched]) {
        matched += 1
        index += 1
      } else if (FILLER_WORDS.has(token.value)) {
        index += 1
      } else {
        break
      }
    }

    if (matched === wanted.length) {
      const rest = name.slice(tokens[index - 1]!.end)
      // Was nach dem Reihennamen steht, beginnt mit Trennzeichen – und bei
      // „Die drei ???" mit den Fragezeichen, die zur Reihe gehören.
      const cleaned = rest.replace(/^[\s\p{P}]+/u, '').trim()
      if (cleaned !== '') return cleaned
    }
  }

  return null
}

/**
 * Nimmt den Reihennamen vorn aus einem Ordnernamen heraus.
 *
 * Auf dem NAS steht er dort oft doppelt: einmal als Ordner, einmal im Namen
 * jeder Folge darin. In der Reihe gelesen ist das nur Rauschen – aus
 * „Die Drei Fragezeichen Kids-68-Chaos Im Dunkeln" wird „68-Chaos Im Dunkeln".
 *
 * Passt kein Kandidat, bleibt der Name, wie er ist. Lieber einmal zu viel
 * stehen lassen als einen Titel anschneiden.
 */
export function stripSeriesPrefix(
  name: string,
  candidates: readonly (string | null)[],
): string {
  let shortest = name
  for (const candidate of candidates) {
    if (candidate === null || candidate.trim() === '') continue
    const stripped = stripOnePrefix(name, candidate)
    if (stripped !== null && stripped.length < shortest.length) shortest = stripped
  }
  return shortest
}

/**
 * `01 - Der Super-Papagei` → `{ title: 'Der Super-Papagei', seriesIndex: 1 }`
 *
 * Die Reihennamen der übergeordneten Ordner fliegen vorher heraus, damit in der
 * Reihe nicht neunmal dasselbe untereinander steht.
 */
export function parseBookFolder(
  name: string,
  seriesNames: readonly (string | null)[] = [],
): FolderName {
  const tidy = tidyName(stripSeriesPrefix(name.trim(), seriesNames))

  // Eine Nummer zählt nur mit Trennzeichen dahinter: „1984" ist ein Titel,
  // „5 Freunde" eine Reihe – beide dürfen ihre Zahl behalten.
  const match = /^(?:(?:folge|teil|nr|episode|kapitel)\.?\s*)?(\d{1,3})\s*[-–—.)_:]\s*(.+)$/i.exec(
    tidy,
  )
  if (match) {
    const [, index = '', title = ''] = match
    return { title: tidyName(title), seriesIndex: Number(index) }
  }

  return { title: tidy === '' ? name.trim() : tidy, seriesIndex: null }
}

/** `5` → `05` – zweistellig liest sich in einer Liste ruhiger. */
export function formatSeriesIndex(index: number): string {
  return index < 10 && index >= 0 ? `0${String(index)}` : String(index)
}

/**
 * Titel eines Kapitels. Der ID3-Titel gewinnt, solange er etwas taugt – oft
 * steht dort aber nur „Track 5“ oder derselbe Buchtitel wie überall.
 */
export function chapterTitle(
  fileName: string,
  tagTitle: string | null,
  position: number,
): string {
  const fromTag = tagTitle?.trim() ?? ''
  if (fromTag !== '' && !/^track\s*\d+$/i.test(fromTag)) return fromTag

  const withoutExtension = fileName.replace(/\.[a-z0-9]+$/i, '')
  const cleaned = withoutExtension
    // führende Nummerierung entfernen: „01 - “, „03.“, „track04_“
    .replace(/^(track|kapitel|chapter)?[\s._-]*\d{1,3}[\s._-]*/i, '')
    .replace(/[_]+/g, ' ')
    .trim()

  return cleaned === '' ? `Kapitel ${position}` : cleaned
}

const AUDIO_EXTENSIONS = new Map<string, string>([
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.m4b', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.ogg', 'audio/ogg'],
  ['.oga', 'audio/ogg'],
  ['.opus', 'audio/ogg'],
  ['.flac', 'audio/flac'],
  ['.wav', 'audio/wav'],
])

export function audioMime(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0) return null
  return AUDIO_EXTENSIONS.get(fileName.slice(dot).toLowerCase()) ?? null
}

export function isAudioFile(fileName: string): boolean {
  return audioMime(fileName) !== null
}

const COVER_NAMES = ['cover', 'folder', 'front', 'albumart']
const COVER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

export function isCoverFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return (
    COVER_EXTENSIONS.includes(lower.slice(dot)) && COVER_NAMES.includes(lower.slice(0, dot))
  )
}

/**
 * Farbe für die Ersatzkachel, wenn kein Cover da ist – aus dem Titel
 * abgeleitet, damit dasselbe Buch immer dieselbe Farbe bekommt.
 */
const TILE_COLORS = [
  '#6d28d9',
  '#0369a1',
  '#047857',
  '#b45309',
  '#be123c',
  '#4338ca',
  '#0f766e',
  '#7c2d12',
]

export function tileColor(seed: string): string {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return TILE_COLORS[hash % TILE_COLORS.length]!
}
