/**
 * Der Lauf, der fehlende Cover online sucht.
 *
 * Läuft im Hintergrund wie der Scan: Bei neunhundert Büchern und dem Tempo,
 * das die Quellen erlauben, dauert er eine dreiviertel Stunde. Niemand wartet
 * währenddessen auf eine Antwort – der Adminbereich fragt den Stand ab.
 *
 * Gesetzt wird nur, was sicher passt. Alles andere wird als Vorschlag gemerkt
 * und wartet auf einen Tap. Der Grund steht in `matching.ts`: Ein falsches
 * Cover ist schlechter als gar keines.
 */
import {
  SICHER_AB,
  VORSCHLAG_AB,
  type CoverSubject,
  scoreHit,
  searchTerm,
} from './matching.js'
import { type CoverQuelle, type Holen, type OnlineHit, sucheBeiApple, sucheBeiMusicBrainz } from './quellen.js'

/** Ein Treffer, der auf Bestätigung wartet. */
export interface CoverVorschlag {
  quelle: CoverQuelle
  title: string
  artist: string | null
  imageUrl: string
  score: number
}

export interface CoverSucheStand {
  laeuft: boolean
  erledigt: number
  gesamt: number
  /** Ohne Rückfrage gesetzt, weil der Treffer eindeutig war. */
  gesetzt: number
  /** Bücher, zu denen Vorschläge bereitliegen. */
  offen: number
  /** Letzte Meldung – „keine Verbindung" gehört sichtbar in den Adminbereich. */
  hinweis: string | null
  beendetAm: string | null
}

/** Ein Buch, wie der Lauf es braucht. */
export interface CoverBuch extends CoverSubject {
  id: string
}

export interface CoverSucheOptions {
  /** Die Bücher ohne Bild – frisch geholt, der Katalog ändert sich. */
  buecher: () => CoverBuch[]
  holen: Holen
  /** Legt ein gefundenes Bild ab. Liefert die neue Adresse oder null. */
  setzen: (bookId: string, bild: Buffer) => Promise<string | null>
  /** Schreibt die Vorschläge weg, damit sie einen Neustart überleben. */
  merken: (vorschlaege: ReadonlyMap<string, CoverVorschlag[]>) => Promise<void>
  /** Abstand zwischen zwei Anfragen. Apple bittet um höchstens 20 pro Minute. */
  pauseMs?: number
  onNotice?: (message: string) => void
}

export interface CoverSuche {
  starten: () => 'gestartet' | 'laeuft'
  /**
   * Sucht für ein einzelnes Buch, auf Zuruf.
   *
   * Setzt nie von selbst, auch bei einem eindeutigen Treffer nicht: Wer hier
   * landet, sieht sich das Buch gerade an und will wählen. Genau dafür ist der
   * Knopf da – oft steht ja schon ein Bild da, das nur nicht gefällt.
   */
  fuerEinBuch: (buch: CoverBuch) => Promise<CoverVorschlag[]>
  stand: () => CoverSucheStand
  vorschlaege: () => ReadonlyMap<string, CoverVorschlag[]>
  /** Setzt die gemerkten Vorschläge beim Start des Dienstes wieder ein. */
  uebernehmen: (gemerkt: ReadonlyMap<string, CoverVorschlag[]>) => void
  /** Nimmt einen Vorschlag aus der Liste – er ist erledigt. */
  vergessen: (bookId: string) => void
}

/** Drei Vorschläge sind eine Wahl, zehn sind eine Aufgabe. */
const HOECHSTENS_VORSCHLAEGE = 3

/** Ein Cover ist ein Bild, kein Film. */
const MAX_BILD_BYTES = 8 * 1024 * 1024

function schlaf(ms: number): Promise<void> {
  return new Promise((fertig) => setTimeout(fertig, ms))
}

/** Lädt ein Bild herunter. Liefert null, wo keines liegt – das ist der Normalfall. */
async function bildHolen(url: string, holen: Holen): Promise<Buffer | null> {
  try {
    const antwort = await holen(url, { signal: AbortSignal.timeout(15_000) })
    // Das Cover Art Archive antwortet mit 404, wo niemand ein Bild hinterlegt
    // hat. Das ist keine Störung, sondern die Auskunft.
    if (!antwort.ok) return null
    const daten = Buffer.from(await antwort.arrayBuffer())
    return daten.length === 0 || daten.length > MAX_BILD_BYTES ? null : daten
  } catch {
    return null
  }
}

export function createCoverSuche(options: CoverSucheOptions): CoverSuche {
  const pauseMs = options.pauseMs ?? 3000
  let laeuft = false
  let stand: CoverSucheStand = {
    laeuft: false,
    erledigt: 0,
    gesamt: 0,
    gesetzt: 0,
    offen: 0,
    hinweis: null,
    beendetAm: null,
  }
  let vorschlaege = new Map<string, CoverVorschlag[]>()

  /** Die besten Treffer einer Quelle, bewertet und sortiert. */
  function bewerten(buch: CoverBuch, treffer: readonly OnlineHit[]): CoverVorschlag[] {
    return treffer
      .map((hit) => ({ ...hit, score: scoreHit(buch, hit) }))
      .filter((hit) => hit.score >= VORSCHLAG_AB)
      .sort((a, b) => b.score - a.score)
      .slice(0, HOECHSTENS_VORSCHLAEGE)
  }

  /**
   * Fragt die Quellen nach einem Buch und bewertet, was zurückkommt.
   *
   * Die zweite Quelle nur, wenn die erste nichts hergab: Jede Anfrage kostet
   * Wartezeit, und bei neunhundert Büchern ist das der Unterschied zwischen
   * einer und zwei Stunden.
   */
  async function fragen(buch: CoverBuch, pause: number): Promise<CoverVorschlag[]> {
    const begriff = searchTerm(buch)
    if (begriff === '') return []

    let gefunden: CoverVorschlag[] = []
    try {
      gefunden = bewerten(buch, await sucheBeiApple(begriff, options.holen))
    } catch (error) {
      stand = { ...stand, hinweis: fehlerText(error) }
    }

    if (gefunden.length === 0) {
      await schlaf(pause)
      try {
        gefunden = bewerten(buch, await sucheBeiMusicBrainz(begriff, options.holen))
      } catch (error) {
        stand = { ...stand, hinweis: fehlerText(error) }
      }
    }
    return gefunden
  }

  async function einBuch(buch: CoverBuch): Promise<void> {
    const gefunden = await fragen(buch, pauseMs)
    const bester = gefunden[0]
    if (bester === undefined) return

    if (bester.score >= SICHER_AB) {
      const bild = await bildHolen(bester.imageUrl, options.holen)
      if (bild !== null && (await options.setzen(buch.id, bild)) !== null) {
        stand = { ...stand, gesetzt: stand.gesetzt + 1 }
        vorschlaege.delete(buch.id)
        return
      }
      // Kein Bild an der Adresse: Dann bleibt der Treffer ein Vorschlag, statt
      // still unter den Tisch zu fallen.
    }

    vorschlaege.set(buch.id, gefunden)
    stand = { ...stand, offen: vorschlaege.size }
  }

  async function lauf(): Promise<void> {
    const offene = options.buecher()
    stand = {
      laeuft: true,
      erledigt: 0,
      gesamt: offene.length,
      gesetzt: 0,
      offen: vorschlaege.size,
      hinweis: null,
      beendetAm: null,
    }
    options.onNotice?.(`Cover-Suche gestartet: ${String(offene.length)} Bücher ohne Bild`)

    try {
      for (const buch of offene) {
        await einBuch(buch)
        stand = { ...stand, erledigt: stand.erledigt + 1 }
        // Die Vorschläge nach jedem Buch wegschreiben wäre neunhundert Mal
        // dieselbe Datei; alle fünfzig reicht, um einen Neustart zu überleben.
        if (stand.erledigt % 50 === 0) await options.merken(vorschlaege)
        await schlaf(pauseMs)
      }
    } finally {
      await options.merken(vorschlaege).catch(() => {
        // Ohne die Datei sind nur die Vorschläge nach einem Neustart weg.
      })
      laeuft = false
      stand = { ...stand, laeuft: false, beendetAm: new Date().toISOString() }
      options.onNotice?.(
        `Cover-Suche fertig: ${String(stand.gesetzt)} gesetzt, ${String(vorschlaege.size)} zur Auswahl`,
      )
    }
  }

  return {
    fuerEinBuch: async (buch) => {
      // Ein einzelner Aufruf braucht keine Bremse: Jemand wartet davor auf die
      // Antwort, und zwei Anfragen bringen keine Quelle ins Schwitzen.
      const gefunden = await fragen(buch, 0)
      if (gefunden.length === 0) {
        vorschlaege.delete(buch.id)
      } else {
        // Gemerkt wird es trotzdem: Ohne das würde das Übernehmen die Adresse
        // nicht wiedererkennen und ablehnen.
        vorschlaege.set(buch.id, gefunden)
      }
      stand = { ...stand, offen: vorschlaege.size }
      await options.merken(vorschlaege).catch(() => {
        // Ohne die Datei sind nur die Vorschläge nach einem Neustart weg.
      })
      return gefunden
    },

    starten: () => {
      if (laeuft) return 'laeuft'
      laeuft = true
      void lauf().catch((error: unknown) => {
        stand = { ...stand, laeuft: false, hinweis: fehlerText(error) }
        laeuft = false
      })
      return 'gestartet'
    },
    stand: () => stand,
    vorschlaege: () => vorschlaege,
    uebernehmen: (gemerkt) => {
      vorschlaege = new Map(gemerkt)
      stand = { ...stand, offen: vorschlaege.size }
    },
    vergessen: (bookId) => {
      vorschlaege.delete(bookId)
      stand = { ...stand, offen: vorschlaege.size }
    },
  }
}

function fehlerText(error: unknown): string {
  const text = error instanceof Error ? error.message : 'Unbekannter Fehler'
  // Eine Adresse mit Suchbegriff drin sagt im Adminbereich niemandem etwas.
  return text.replace(/https?:\/\/\S+/g, 'die Quelle')
}
