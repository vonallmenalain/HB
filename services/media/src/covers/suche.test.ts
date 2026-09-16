import { describe, expect, it, vi } from 'vitest'

import { type CoverBuch, type CoverVorschlag, createCoverSuche } from './suche.js'
import type { Holen } from './quellen.js'

const KARPATENHUND: CoverBuch = {
  id: 'b_1',
  series: 'Die drei ???',
  seriesIndex: 3,
  title: 'Der Karpatenhund',
}

/** Eine Quelle, die vorgegebene Alben liefert – und ein Bild an jeder Adresse. */
function quelle(alben: { collectionName: string; artistName?: string }[]): Holen {
  return ((url: string) => {
    if (url.startsWith('https://itunes.apple.com')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            results: alben.map((album) => ({
              ...album,
              artworkUrl100: 'https://bild.example.com/a/100x100bb.jpg',
            })),
          }),
      } as unknown as Response)
    }
    if (url.startsWith('https://musicbrainz.org')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ releases: [] }),
      } as unknown as Response)
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
    } as unknown as Response)
  }) as unknown as Holen
}

/** Wartet, bis der Lauf durch ist – er läuft absichtlich im Hintergrund. */
async function fertig(stand: () => { laeuft: boolean }): Promise<void> {
  for (let i = 0; i < 200 && stand().laeuft; i += 1) {
    await new Promise((weiter) => setTimeout(weiter, 5))
  }
}

function bauen(alben: { collectionName: string; artistName?: string }[], buecher = [KARPATENHUND]) {
  const setzen = vi.fn(() => Promise.resolve('/cover/b_1.jpg'))
  const gemerkt: CoverVorschlag[][] = []
  const suche = createCoverSuche({
    buecher: () => buecher,
    holen: quelle(alben),
    setzen,
    merken: (alle) => {
      gemerkt.push([...alle.values()].flat())
      return Promise.resolve()
    },
    pauseMs: 0,
  })
  return { suche, setzen, gemerkt }
}

describe('createCoverSuche', () => {
  it('setzt einen eindeutigen Treffer ohne Rückfrage', async () => {
    const { suche, setzen } = bauen([
      { collectionName: 'Die drei ??? - Folge 3: Der Karpatenhund', artistName: 'Die drei ???' },
    ])

    expect(suche.starten()).toBe('gestartet')
    await fertig(suche.stand)

    expect(setzen).toHaveBeenCalledTimes(1)
    expect(suche.stand().gesetzt).toBe(1)
    expect(suche.vorschlaege().size).toBe(0)
  })

  it('legt einen unsicheren Treffer als Vorschlag beiseite', async () => {
    // Ohne Folgennummer im Treffer lässt sich nicht bestätigen, dass es die
    // richtige ist – das reicht für einen Vorschlag, nicht fürs Setzen.
    const { suche, setzen } = bauen([
      { collectionName: 'Der Karpatenhund', artistName: 'Die drei Fragezeichen' },
    ])

    suche.starten()
    await fertig(suche.stand)

    expect(setzen).not.toHaveBeenCalled()
    expect(suche.vorschlaege().get('b_1')).toHaveLength(1)
    expect(suche.stand().offen).toBe(1)
  })

  it('lässt ein fremdes Hörspiel ganz liegen', async () => {
    const { suche, setzen } = bauen([
      { collectionName: 'Bibi Blocksberg: Das Hexenkraut', artistName: 'Kiddinx' },
    ])

    suche.starten()
    await fertig(suche.stand)

    expect(setzen).not.toHaveBeenCalled()
    expect(suche.vorschlaege().size).toBe(0)
  })

  it('startet nicht zweimal nebeneinander', () => {
    const { suche } = bauen([{ collectionName: 'egal' }])
    expect(suche.starten()).toBe('gestartet')
    expect(suche.starten()).toBe('laeuft')
  })

  it('schreibt die Vorschläge am Ende weg', async () => {
    const { suche, gemerkt } = bauen([{ collectionName: 'Der Karpatenhund' }])
    suche.starten()
    await fertig(suche.stand)
    expect(gemerkt.length).toBeGreaterThan(0)
  })

  it('meldet, wenn die Quelle nicht erreichbar ist', async () => {
    const { suche } = (() => {
      const suche = createCoverSuche({
        buecher: () => [KARPATENHUND],
        holen: () => Promise.reject(new Error('fetch failed: https://itunes.apple.com/x')),
        setzen: () => Promise.resolve(null),
        merken: () => Promise.resolve(),
        pauseMs: 0,
      })
      return { suche }
    })()

    suche.starten()
    await fertig(suche.stand)

    // Die Adresse mit dem Suchbegriff darin sagt im Adminbereich niemandem
    // etwas – der Grund schon.
    expect(suche.stand().hinweis).toBe('fetch failed: die Quelle')
  })
})
