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
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue({ requests: [ANFRAGE], deny }),
    })

    await userEvent.click(screen.getByRole('button', { name: 'Ablehnen' }))
    expect(deny).toHaveBeenCalledWith(ANFRAGE)
  })

  it('lässt den eigenen Zugang nicht entziehen', () => {
    renderWithProfiles(<AdminScreen />, profiles(), {
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

  it('speichert einen von Hand geänderten Titel', async () => {
    const setTitle = vi.fn().mockResolvedValue(undefined)
    const book = makeBook({ id: 'b_1', title: 'Chaos im Dunkeln', seriesIndex: 68 })

    renderWithProfiles(<AdminScreen />, profiles(), {
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue(),
      library: makeLibraryValue({ books: [book] }),
      titles: makeTitlesValue({ setTitle }),
    })

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
    currentTicket: () => 't',
    fetchCatalog: () => Promise.resolve({ status: 'not-modified' }),
    startRescan: () => Promise.resolve('started'),
    fetchStatus: () =>
      Promise.resolve({ scanning: false, books: 1, schemaVersion: 2, scannedAt: null }),
    fetchFolders: () => Promise.resolve([]),
    fetchManualCovers: () => Promise.resolve([]),
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

describe('Cover im Adminbereich', () => {
  const BUCH = makeBook({ id: 'b_1', title: 'Der Super-Papagei', cover: null })

  function zeigen(client: MediaClient, refresh = vi.fn()) {
    renderWithProfiles(<AdminScreen />, profiles(), {
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
      auth: makeAuthValue({ isAdmin: true }),
      admin: makeAdminValue(),
      library: makeLibraryValue({
        books: [mitBild],
        client: makeClient({ removeCover, fetchManualCovers: () => Promise.resolve(['b_1']) }),
      }),
    })

    await userEvent.type(screen.getByLabelText('Hörbuch suchen'), 'Papagei')
    await userEvent.click(
      await screen.findByRole('button', { name: 'Eigenes Bild zurücknehmen' }),
    )

    expect(removeCover).toHaveBeenCalledWith('b_1')
  })

  it('bietet das Zurücknehmen nicht an, wo das Bild vom NAS kommt', async () => {
    // Der Knopf löscht nur ein hochgeladenes Bild. An einem Cover aus dem
    // Ordner täte er nichts – und ein Knopf, der nichts tut, sieht aus wie ein
    // Fehler.
    const mitBild = makeBook({ id: 'b_1', title: 'Der Super-Papagei', cover: '/cover/b_1.jpg' })

    renderWithProfiles(<AdminScreen />, profiles(), {
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
