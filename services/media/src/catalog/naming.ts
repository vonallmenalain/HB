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

/** `01 - Der Super-Papagei` → `{ title: 'Der Super-Papagei', seriesIndex: 1 }` */
export function parseBookFolder(name: string): FolderName {
  const match = /^(\d{1,3})\s*[-–—.)_]\s*(.+)$/.exec(name.trim())
  if (match) {
    const [, index = '', title = ''] = match
    return { title: title.trim(), seriesIndex: Number(index) }
  }
  return { title: name.trim(), seriesIndex: null }
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
