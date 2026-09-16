import { describe, expect, it, vi } from 'vitest'

import { type Holen, sucheBeiApple, sucheBeiMusicBrainz } from './quellen.js'

function antwort(daten: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 503,
    json: () => Promise.resolve(daten),
  } as unknown as Response
}

describe('sucheBeiApple', () => {
  it('liest Titel, Interpret und ein grosses Bild heraus', async () => {
    const holen = vi.fn(() =>
      Promise.resolve(
        antwort({
          results: [
            {
              collectionName: 'Die drei ??? - Der Karpatenhund',
              artistName: 'Die drei ???',
              artworkUrl100: 'https://is1.example.com/image/thumb/abc/100x100bb.jpg',
            },
          ],
        }),
      ),
    ) as unknown as Holen

    const treffer = await sucheBeiApple('Die drei ??? Der Karpatenhund', holen)

    expect(treffer).toEqual([
      {
        quelle: 'apple',
        title: 'Die drei ??? - Der Karpatenhund',
        artist: 'Die drei ???',
        // 100 Pixel wären auf der Kachel ein Briefmarkenbild.
        imageUrl: 'https://is1.example.com/image/thumb/abc/600x600bb.jpg',
      },
    ])
  })

  it('überspringt Einträge ohne Bild', async () => {
    const holen = vi.fn(() =>
      Promise.resolve(antwort({ results: [{ collectionName: 'Ohne Bild' }] })),
    ) as unknown as Holen

    expect(await sucheBeiApple('egal', holen)).toEqual([])
  })

  it('wirft, wenn die Quelle nicht antwortet', async () => {
    const holen = vi.fn(() => Promise.resolve(antwort({}, false))) as unknown as Holen
    await expect(sucheBeiApple('egal', holen)).rejects.toThrow('503')
  })
})

describe('sucheBeiMusicBrainz', () => {
  it('baut die Adresse zum Cover Art Archive', async () => {
    const holen = vi.fn(() =>
      Promise.resolve(
        antwort({
          releases: [
            {
              id: 'aaaa-bbbb',
              title: 'Der Karpatenhund',
              'artist-credit': [{ name: 'Die drei ???' }],
            },
          ],
        }),
      ),
    ) as unknown as Holen

    expect(await sucheBeiMusicBrainz('Der Karpatenhund', holen)).toEqual([
      {
        quelle: 'musicbrainz',
        title: 'Der Karpatenhund',
        artist: 'Die drei ???',
        imageUrl: 'https://coverartarchive.org/release/aaaa-bbbb/front-500',
      },
    ])
  })

  it('nennt sich beim Namen', async () => {
    // MusicBrainz sperrt anonyme Aufrufer aus – ohne diesen Kopf steht der
    // Lauf nach ein paar Anfragen still.
    const holen = vi.fn(() => Promise.resolve(antwort({ releases: [] })))
    await sucheBeiMusicBrainz('egal', holen)

    const [, init] = holen.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('HB-Hoerbuch')
  })
})
