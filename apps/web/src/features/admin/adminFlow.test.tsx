import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AdminScreen } from '@/routes/AdminScreen'
import { type AccessRequest } from '@/features/auth/accessRequest'
import type { MediaClient, MediaFolder } from '@/features/library/mediaClient'
import {
  makeAdminValue,
  makeAuthValue,
  makeBook,
  makeLibraryValue,
  makeProfile,
  makeProfilesValue,
  makeTitlesValue,
  renderWithProfiles,
} from '@/test/renderWithProfiles'

const EMMA = makeProfile()
const profiles = () => makeProfilesValue({ profiles: [EMMA], selected: EMMA })

const ANFRAGE: AccessRequest = {
  uid: 'u_neu',
  email: 'oma@example.com',
  name: 'Oma',
  requestedAt: '2026-01-01T00:00:00.000Z',
  status: 'pending',
}

describe('Adminbereich', () => {
  it('bleibt für andere Konten leer', () => {
    renderWithProfiles(<AdminScreen />, profiles(), {
      auth: makeAuthValue({ isAdmin: false }),
      admin: makeAdminValue({ requests: [ANFRAGE] }),
    })

    expect(screen.queryByText('Oma')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Elternbereich/ })).toBeInTheDocument()
  })

  it('zeigt offene Anfragen mit Namen statt einer UID', async () => {
    // Das ist der ganze Punkt des Umbaus: keine Kennung abtippen, sondern
    // sehen, wer da anklopft.
    const approve = vi.fn().mockResolvedValue(undefined)

    renderWithProfiles(<AdminScreen />, profiles(), {
      route: '/admin/zugaenge',
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue({ requests: [ANFRAGE], approve }),
    })

    expect(screen.getByText('Oma')).toBeInTheDocument()
    expect(screen.queryByText('u_neu')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Freigeben' }))
    expect(approve).toHaveBeenCalledWith(ANFRAGE)
  })

  it('lehnt eine Anfrage ab, ohne sie zu vergessen', async () => {
    const deny = vi.fn().mockResolvedValue(undefined)

    renderWithProfiles(<AdminScreen />, profiles(), {
      route: '/admin/zugaenge',
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue({ requests: [ANFRAGE], deny }),
    })

    await userEvent.click(screen.getByRole('button', { name: 'Ablehnen' }))
    expect(deny).toHaveBeenCalledWith(ANFRAGE)
  })

  it('lässt den eigenen Zugang nicht entziehen', () => {
    renderWithProfiles(<AdminScreen />, profiles(), {
      route: '/admin/zugaenge',
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue({
        accounts: [
          { uid: 'u1', email: 'chef@example.com', name: null, admin: true, approvedAt: '' },
          { uid: 'u2', email: 'oma@example.com', name: null, admin: false, approvedAt: '' },
        ],
      }),
    })

    // Genau ein „Zugriff entziehen" – das des Administrators fehlt.
    expect(screen.getAllByRole('button', { name: 'Zugriff entziehen' })).toHaveLength(1)
  })

  it('zeigt vorn eine Übersicht statt aller Abschnitte untereinander', () => {
    // Sechs Abschnitte mit Erklärtext, Suchfeld und Liste waren zusammen ein
    // Bildschirm, an dem man vorbeiscrollte.
    renderWithProfiles(<AdminScreen />, profiles(), {
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue(),
      library: makeLibraryValue({ books: [] }),
    })

    const ziele = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(ziele).toEqual(
      expect.arrayContaining([
        '/admin/zugaenge',
        '/admin/titel',
        '/admin/cover',
        '/admin/cover-suche',
        '/admin/ordner',
        '/admin/gehoert',
      ]),
    )
    // Die Abschnitte selbst stehen erst hinter ihrer Kachel.
    expect(screen.queryByLabelText('Hörbuch suchen')).not.toBeInTheDocument()
  })

  it('nennt offene Zugriffsanfragen schon auf der Kachel', () => {
    // Sie sind das Einzige hier, was von selbst auftaucht und wartet.
    renderWithProfiles(<AdminScreen />, profiles(), {
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue({ requests: [ANFRAGE] }),
      library: makeLibraryValue({ books: [] }),
    })

    expect(screen.getByRole('link', { name: /Zugänge · 1 offen/ })).toBeInTheDocument()
  })

  it('führt von einer unbekannten Adresse zurück zur Übersicht', () => {
    renderWithProfiles(<AdminScreen />, profiles(), {
      route: '/admin/gibtsnicht',
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue(),
      library: makeLibraryValue({ books: [] }),
    })

    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href')),
    ).toContain('/admin/ordner')
  })

  it('zeigt Hörbücher in „Titel" erst nach einer Suche', () => {
    renderWithProfiles(<AdminScreen />, profiles(), {
      route: '/admin/titel',
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue(),
      library: makeLibraryValue({ books: [makeBook({ id: 'b_1', title: 'Chaos im Dunkeln' })] }),
    })

    expect(screen.queryByRole('button', { name: 'Umbenennen' })).not.toBeInTheDocument()
    expect(screen.getByText(/Erst suchen/)).toBeInTheDocument()
  })

  it('speichert einen von Hand geänderten Titel', async () => {
    const setTitle = vi.fn().mockResolvedValue(undefined)
    const book = makeBook({ id: 'b_1', title: 'Chaos im Dunkeln', seriesIndex: 68 })

    renderWithProfiles(<AdminScreen />, profiles(), {
      route: '/admin/titel',
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue(),
      library: makeLibraryValue({ books: [book] }),
      titles: makeTitlesValue({ setTitle }),
    })

    // Erst suchen: Bei neunhundert Hörbüchern ist die Liste sonst der
    // Bildschirm.
    await userEvent.type(screen.getByLabelText('Suchen'), 'Chaos')

    await userEvent.click(screen.getByRole('button', { name: 'Umbenennen' }))

    const feld = screen.getByLabelText('Neuer Titel')
    // Vorbelegt mit dem, was in der Liste steht – so wird aus „ändern" ein
    // Korrigieren und kein Neuschreiben.
    expect(feld).toHaveValue('68 - Chaos im Dunkeln')

    await userEvent.clear(feld)
    await userEvent.type(feld, '68 - Chaos im Dunkeln (Hörspiel)')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(setTitle).toHaveBeenCalledWith('b_1', '68 - Chaos im Dunkeln (Hörspiel)')
  })
})

/**
 * Ein Medien-Dienst, der nur das kann, was der Adminbereich von ihm braucht.
 *
 * Bewusst kein Mock der ganzen Schnittstelle: Geprüft wird, was die App
 * hinausschickt, wenn jemand auf einen Knopf drückt.
 */
function makeClient(overrides: Partial<MediaClient> = {}): MediaClient {
  return {
    ensureTicket: () => Promise.resolve('t'),
    renewTicket: () => Promise.resolve('t'),
    currentTicket: () => 't',
    fetchCatalog: () => Promise.resolve({ status: 'not-modified' }),
    startRescan: () => Promise.resolve('started'),
    fetchStatus: () =>
      Promise.resolve({ scanning: false, books: 1, schemaVersion: 2, scannedAt: null }),
    fetchFolders: () => Promise.resolve([]),
    fetchOwnCovers: () => Promise.resolve({}),
    startCoverSearch: () => Promise.resolve('started' as const),
    fetchCoverSearch: () =>
      Promise.resolve({
        stand: {
          laeuft: false,
          erledigt: 0,
          gesamt: 0,
          gesetzt: 0,
          offen: 0,
          hinweis: null,
          beendetAm: null,
        },
        vorschlaege: {},
      }),
    searchCoversFor: () => Promise.resolve([]),
    applyCoverSuggestion: () => Promise.resolve('/cover/x.jpg'),
    suggestionUrl: () => null,
    setFolderMode: () => Promise.resolve(),
    uploadCover: () => Promise.resolve('/cover/b_1.jpg?v=2'),
    removeCover: () => Promise.resolve(),
    coverUrl: (path) => `https://nas.example${path}&t=t`,
    audioUrl: () => null,
    canonicalAudioUrl: (bookId, fileIdx) => `/audio/${bookId}/${String(fileIdx)}`,
    canonicalCoverUrl: (path) => path,
    forgetTicket: () => undefined,
    ...overrides,
  }
}

const ORDNER: MediaFolder = {
  path: 'Die Drei Ausrufezeichen',
  books: 1,
  files: 94,
  titles: ['Die Drei Ausrufezeichen'],
  mode: null,
}

describe('Cover online suchen', () => {
  const OHNE_BILD = makeBook({ id: 'b_1', title: 'Der Karpatenhund', cover: null })

  const VORSCHLAG = {
    quelle: 'apple' as const,
    title: 'Die drei ??? - Der Karpatenhund',
    artist: 'Die drei ???',
    imageUrl: 'https://bild.example.com/a/600x600bb.jpg',
    score: 0.6,
  }

  const STAND = {
    laeuft: false,
    erledigt: 1,
    gesamt: 1,
    gesetzt: 0,
    offen: 1,
    hinweis: null,
    beendetAm: '2026-09-16T10:00:00.000Z',
  }

  it('startet den Lauf', async () => {
    const startCoverSearch = vi.fn().mockResolvedValue('started')
    renderWithProfiles(<AdminScreen />, profiles(), {
      route: '/admin/cover-suche',
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue(),
      library: makeLibraryValue({ books: [OHNE_BILD], client: makeClient({ startCoverSearch }) }),
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Cover suchen' }))
    expect(startCoverSearch).toHaveBeenCalled()
  })

  it('übernimmt einen Vorschlag auf Tap', async () => {
    // Gesetzt wird nur, was eindeutig passt – alles andere wartet hier auf
    // einen Tap. Ein falsches Cover ist schlechter als gar keines.
    const applyCoverSuggestion = vi.fn().mockResolvedValue('/cover/b_1.jpg?v=9')
    const refresh = vi.fn()
    renderWithProfiles(<AdminScreen />, profiles(), {
      route: '/admin/cover-suche',
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue(),
      library: makeLibraryValue({
        books: [OHNE_BILD],
        refresh,
        client: makeClient({
          applyCoverSuggestion,
          fetchCoverSearch: () =>
            Promise.resolve({ stand: STAND, vorschlaege: { b_1: [VORSCHLAG] } }),
        }),
      }),
    })

    await userEvent.click(
      await screen.findByRole('button', { name: /Die drei \?\?\? - Der Karpatenhund/ }),
    )

    expect(applyCoverSuggestion).toHaveBeenCalledWith('b_1', VORSCHLAG.imageUrl)
    await waitFor(() => {
      expect(refresh).toHaveBeenCalled()
    })
  })

  it('holt die Vorschaubilder über den Dienst, nicht von der Quelle', async () => {
    // Sonst müsste die Content-Security-Policy fremde Bildquellen zulassen,
    // und jeder Aufruf verriete dem Anbieter, wer im Adminbereich sitzt.
    const suggestionUrl = vi.fn(() => 'https://hb-media.example.com/admin/cover-vorschlag/b_1?bild=x')
    renderWithProfiles(<AdminScreen />, profiles(), {
      route: '/admin/cover-suche',
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue(),
      library: makeLibraryValue({
        books: [OHNE_BILD],
        client: makeClient({
          suggestionUrl,
          fetchCoverSearch: () =>
            Promise.resolve({ stand: STAND, vorschlaege: { b_1: [VORSCHLAG] } }),
        }),
      }),
    })

    await screen.findByRole('button', { name: /Der Karpatenhund/ })
    expect(suggestionUrl).toHaveBeenCalledWith('b_1', VORSCHLAG.imageUrl)
  })
})

describe('Cover im Adminbereich', () => {
  const BUCH = makeBook({ id: 'b_1', title: 'Der Super-Papagei', cover: null })

  function zeigen(client: MediaClient, refresh = vi.fn()) {
    renderWithProfiles(<AdminScreen />, profiles(), {
      route: '/admin/cover',
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue(),
      library: makeLibraryValue({ books: [BUCH], client, refresh }),
    })
    return refresh
  }

  it('schickt ein gewähltes Bild an das NAS', async () => {
    const uploadCover = vi.fn().mockResolvedValue('/cover/b_1.jpg?v=2')
    const refresh = zeigen(makeClient({ uploadCover }))

    // Erst suchen: Bei tausend Hörbüchern ist die Liste sonst der Bildschirm.
    await userEvent.type(screen.getByLabelText('Hörbuch suchen'), 'Papagei')

    const bild = new File(['x'], 'papagei.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Bild für Der Super-Papagei'), bild)

    expect(uploadCover).toHaveBeenCalledWith('b_1', bild)
    // Ohne das Neuladen zeigte die App weiter das alte Bild: Die Adresse mit
    // der neuen Version steht im Katalog.
    await waitFor(() => {
      expect(refresh).toHaveBeenCalled()
    })
  })

  it('nimmt ein hochgeladenes Bild wieder weg', async () => {
    const removeCover = vi.fn().mockResolvedValue(undefined)
    const mitBild = makeBook({ id: 'b_1', title: 'Der Super-Papagei', cover: '/cover/b_1.jpg' })

    renderWithProfiles(<AdminScreen />, profiles(), {
      route: '/admin/cover',
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue(),
      library: makeLibraryValue({
        books: [mitBild],
        client: makeClient({ removeCover, fetchOwnCovers: () => Promise.resolve({ b_1: 'hochgeladen' as const }) }),
      }),
    })

    await userEvent.type(screen.getByLabelText('Hörbuch suchen'), 'Papagei')
    await userEvent.click(
      await screen.findByRole('button', { name: 'Eigenes Bild zurücknehmen' }),
    )

    expect(removeCover).toHaveBeenCalledWith('b_1')
  })

  it('sucht auf Zuruf für ein einzelnes Hörbuch', async () => {
    // Auch wo schon ein Bild steht: Oft ist genau das der Grund – das Bild aus
    // den ID3-Tags ist eine graue Notenzeile.
    const VORSCHLAG = {
      quelle: 'apple' as const,
      title: 'Die drei ??? - Der Super-Papagei',
      artist: 'Die drei ???',
      imageUrl: 'https://bild.example.com/a/600x600bb.jpg',
      score: 0.7,
    }
    const searchCoversFor = vi.fn().mockResolvedValue([VORSCHLAG])
    const applyCoverSuggestion = vi.fn().mockResolvedValue('/cover/b_1.jpg?v=3')
    const refresh = zeigen(makeClient({ searchCoversFor, applyCoverSuggestion }))

    await userEvent.type(screen.getByLabelText('Hörbuch suchen'), 'Papagei')
    await userEvent.click(screen.getByRole('button', { name: 'Cover online suchen' }))

    expect(searchCoversFor).toHaveBeenCalledWith('b_1')

    await userEvent.click(
      await screen.findByRole('button', { name: /Die drei \?\?\? - Der Super-Papagei/ }),
    )
    expect(applyCoverSuggestion).toHaveBeenCalledWith('b_1', VORSCHLAG.imageUrl)
    await waitFor(() => {
      expect(refresh).toHaveBeenCalled()
    })
  })

  it('sagt es, wenn die Einzelsuche nichts Sicheres findet', async () => {
    zeigen(makeClient({ searchCoversFor: () => Promise.resolve([]) }))

    await userEvent.type(screen.getByLabelText('Hörbuch suchen'), 'Papagei')
    await userEvent.click(screen.getByRole('button', { name: 'Cover online suchen' }))

    expect(await screen.findByText(/Nichts gefunden/)).toBeInTheDocument()
  })

  it('bietet das Zurücknehmen nicht an, wo das Bild vom NAS kommt', async () => {
    // Der Knopf löscht nur ein hochgeladenes Bild. An einem Cover aus dem
    // Ordner täte er nichts – und ein Knopf, der nichts tut, sieht aus wie ein
    // Fehler.
    const mitBild = makeBook({ id: 'b_1', title: 'Der Super-Papagei', cover: '/cover/b_1.jpg' })

    renderWithProfiles(<AdminScreen />, profiles(), {
      route: '/admin/cover',
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue(),
      library: makeLibraryValue({ books: [mitBild], client: makeClient() }),
    })

    await userEvent.type(screen.getByLabelText('Hörbuch suchen'), 'Papagei')

    expect(await screen.findByText('Bild vom NAS.')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Eigenes Bild zurücknehmen' }),
    ).not.toBeInTheDocument()
  })

  it('bietet das Zurücknehmen nicht an, wo gar kein Bild ist', async () => {
    zeigen(makeClient())
    await userEvent.type(screen.getByLabelText('Hörbuch suchen'), 'Papagei')

    expect(
      screen.queryByRole('button', { name: 'Eigenes Bild zurücknehmen' }),
    ).not.toBeInTheDocument()
  })
})

describe('Ordner umstellen', () => {
  function zeigen(client: MediaClient) {
    renderWithProfiles(<AdminScreen />, profiles(), {
      route: '/admin/ordner',
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue(),
      library: makeLibraryValue({ books: [makeBook()], client }),
    })
  }

  it('zeigt die Ordner mit ihren Zahlen', async () => {
    zeigen(makeClient({ fetchFolders: () => Promise.resolve([ORDNER]) }))

    expect(await screen.findByText('Die Drei Ausrufezeichen')).toBeInTheDocument()
    expect(screen.getByText(/94 Dateien/)).toBeInTheDocument()
    expect(screen.getByText('Ein Hörbuch, jede Datei ein Kapitel.')).toBeInTheDocument()
  })

  it('stellt einen Ordner auf Einzelfolgen um', async () => {
    const setFolderMode = vi.fn().mockResolvedValue(undefined)
    zeigen(makeClient({ fetchFolders: () => Promise.resolve([ORDNER]), setFolderMode }))

    await userEvent.click(await screen.findByRole('button', { name: 'Jede Datei ein Hörbuch' }))

    await waitFor(() => {
      expect(setFolderMode).toHaveBeenCalledWith('Die Drei Ausrufezeichen', 'einzelfolgen')
    })
  })

  it('bietet bei umgestellten Ordnern den Weg zurück an', async () => {
    const setFolderMode = vi.fn().mockResolvedValue(undefined)
    zeigen(
      makeClient({
        fetchFolders: () => Promise.resolve([{ ...ORDNER, mode: 'einzelfolgen', books: 94 }]),
        setFolderMode,
      }),
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Doch ein Hörbuch' }))

    await waitFor(() => {
      expect(setFolderMode).toHaveBeenCalledWith('Die Drei Ausrufezeichen', 'einBuch')
    })
  })
})
