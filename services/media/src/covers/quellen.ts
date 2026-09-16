/**
 * Wo Cover herkommen, wenn auf dem NAS keines liegt.
 *
 * Zwei Quellen, beide ohne Anmeldung und ohne Schlüssel: Apple kennt die
 * deutschen Hörspielreihen fast vollständig, MusicBrainz und das Cover Art
 * Archive springen für ältere CD-Ausgaben ein, die dort fehlen. Gefragt wird
 * die zweite nur, wenn die erste nichts Brauchbares liefert – jede Anfrage
 * kostet Wartezeit, und bei neunhundert Büchern summiert sich das.
 *
 * Beide Betreiber bitten um ein ruhiges Tempo; eingehalten wird das vom
 * Aufrufer (siehe `suche.ts`), nicht hier.
 */
import type { CoverHit } from './matching.js'

/** Welche Quelle ein Bild geliefert hat – steht im Adminbereich an der Kachel. */
export type CoverQuelle = 'apple' | 'musicbrainz'

export interface OnlineHit extends CoverHit {
  quelle: CoverQuelle
  imageUrl: string
}

/**
 * Wer da anfragt.
 *
 * MusicBrainz verlangt das ausdrücklich und sperrt anonyme Aufrufer aus. Die
 * Projektadresse statt einer Mailadresse: Sie steht ohnehin öffentlich und
 * gehört niemandem persönlich.
 */
const USER_AGENT = 'HB-Hoerbuch/1.0 ( https://github.com/vonallmenalain/HB )'

/** Antwortet die Quelle nicht in dieser Zeit, ist sie diesen Lauf nicht dabei. */
const TIMEOUT_MS = 10_000

export type Holen = typeof fetch

async function json(holen: Holen, url: string): Promise<unknown> {
  const antwort = await holen(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!antwort.ok) throw new Error(`${url}: HTTP ${String(antwort.status)}`)
  return antwort.json()
}

function text(wert: unknown): string | null {
  return typeof wert === 'string' && wert.trim() !== '' ? wert.trim() : null
}

/**
 * Apple liefert die Adresse eines 100-Pixel-Bildes.
 *
 * Die Grösse steht im Dateinamen und lässt sich hochdrehen – 600 reicht für
 * die grösste Kachel und bleibt klein genug fürs Mobilfunknetz.
 */
function grossesBild(url: string): string {
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/i, '/600x600bb.$1')
}

export async function sucheBeiApple(begriff: string, holen: Holen): Promise<OnlineHit[]> {
  const url =
    'https://itunes.apple.com/search?' +
    new URLSearchParams({
      term: begriff,
      country: 'DE',
      media: 'music',
      entity: 'album',
      limit: '8',
    }).toString()

  const roh = await json(holen, url)
  const ergebnisse = (roh as { results?: unknown }).results
  if (!Array.isArray(ergebnisse)) return []

  const treffer: OnlineHit[] = []
  for (const eintrag of ergebnisse) {
    const satz = eintrag as Record<string, unknown>
    const titel = text(satz.collectionName)
    const bild = text(satz.artworkUrl100)
    if (titel === null || bild === null) continue
    treffer.push({
      quelle: 'apple',
      title: titel,
      artist: text(satz.artistName),
      imageUrl: grossesBild(bild),
    })
  }
  return treffer
}

/**
 * MusicBrainz kennt die Ausgabe, das Cover Art Archive das Bild dazu.
 *
 * Ob es eines gibt, sagt erst der zweite Aufruf – deshalb wird nur für die
 * besten Kandidaten überhaupt nachgesehen, nicht für alle fünf.
 */
export async function sucheBeiMusicBrainz(
  begriff: string,
  holen: Holen,
  hoechstens = 3,
): Promise<OnlineHit[]> {
  const url =
    'https://musicbrainz.org/ws/2/release/?' +
    new URLSearchParams({ query: begriff, fmt: 'json', limit: '5' }).toString()

  const roh = await json(holen, url)
  const releases = (roh as { releases?: unknown }).releases
  if (!Array.isArray(releases)) return []

  const treffer: OnlineHit[] = []
  for (const eintrag of releases.slice(0, hoechstens)) {
    const satz = eintrag as Record<string, unknown>
    const id = text(satz.id)
    const titel = text(satz.title)
    if (id === null || titel === null) continue

    const kuenstler = Array.isArray(satz['artist-credit'])
      ? text((satz['artist-credit'][0] as Record<string, unknown> | undefined)?.name)
      : null

    treffer.push({
      quelle: 'musicbrainz',
      title: titel,
      artist: kuenstler,
      // Die Adresse leitet auf das Archiv weiter und antwortet mit 404, wenn
      // niemand ein Bild hinterlegt hat. Geprüft wird das beim Herunterladen –
      // ein eigener Aufruf nur zum Nachsehen wäre die halbe Wartezeit noch
      // einmal.
      imageUrl: `https://coverartarchive.org/release/${id}/front-500`,
    })
  }
  return treffer
}
