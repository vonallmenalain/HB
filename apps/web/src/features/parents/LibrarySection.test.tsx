import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LibraryContext, type LibraryContextValue } from '@/features/library/libraryContext'
import {
  type MediaClient,
  MediaRequestError,
  type NasStatus,
} from '@/features/library/mediaClient'
import { makeBook, makeLibraryValue } from '@/test/renderWithProfiles'

import { LibrarySection } from './LibrarySection'

/**
 * Ein Dienst, der auf Wunsch eine Folge von Zuständen liefert.
 *
 * Der Ablauf im Elternbereich fragt `/health` so lange, bis kein Scan mehr
 * läuft – hier steht deshalb die ganze Folge, nicht nur ein Wert.
 */
function makeClient(verlauf: NasStatus[], overrides: Partial<MediaClient> = {}): MediaClient {
  const rest = [...verlauf]
  return {
    startRescan: vi.fn<MediaClient['startRescan']>().mockResolvedValue('started'),
    fetchStatus: vi
      .fn<MediaClient['fetchStatus']>()
      .mockImplementation(() => Promise.resolve(rest.length > 1 ? rest.shift()! : rest[0]!)),
    ...overrides,
  } as MediaClient
}

/**
 * Jeder Aufruf steht für einen anderen Zeitpunkt.
 *
 * Genau wie beim echten Dienst: Ein durchgelaufener Scan hinterlässt einen
 * neuen Katalog-Zeitstempel. Bleibt er gleich, hat der Scan nichts hinterlassen
 * – und das soll die App auch so sagen.
 */
let uhr = 0
const status = (overrides: Partial<NasStatus> = {}): NasStatus => {
  uhr += 1
  return {
    scanning: false,
    books: 10,
    schemaVersion: 2,
    scannedAt: `2026-02-01T10:0${String(uhr)}:00.000Z`,
    ...overrides,
  }
}

function zeigen(overrides: Partial<LibraryContextValue> = {}) {
  const value = makeLibraryValue({ books: [makeBook()], ...overrides })
  render(
    <LibraryContext value={value}>
      <LibrarySection />
    </LibraryContext>,
  )
  return value
}

describe('Bibliothek im Elternbereich', () => {
  it('sagt, wie viele Hörbücher vom NAS kamen', () => {
    zeigen({ books: [makeBook({ id: 'a' }), makeBook({ id: 'b' })] })

    expect(screen.getByText(/2 Hörbücher vom NAS/)).toBeInTheDocument()
  })

  it('nennt einen zu alten Medien-Dienst beim Namen', () => {
    // Ohne Reihen im Katalog sieht die Bibliothek aus, als wäre jedes Hörbuch
    // eine eigene Reihe. Wer das sieht, sucht den Fehler sonst in der App.
    zeigen({ schemaVersion: 1 })

    expect(screen.getByText(/älter als die App/)).toBeInTheDocument()
    expect(screen.getByText(/neu bauen/)).toBeInTheDocument()
  })

  it('schweigt, solange der Dienst aktuell ist', () => {
    zeigen({ schemaVersion: 2 })

    expect(screen.queryByText(/älter als die App/)).not.toBeInTheDocument()
  })

  it('macht kenntlich, wenn nur der letzte Stand gezeigt wird', () => {
    // Beantwortet die Frage, warum ein neues Hörbuch nicht auftaucht.
    zeigen({ fromCache: true })

    expect(screen.getByText(/letzten bekannten Stand/)).toBeInTheDocument()
  })

  it('nennt den Fehler im Klartext', () => {
    // Hier lesen Eltern, nicht Kinder – „403" hilft niemandem, der Satz schon.
    zeigen({ error: 'forbidden' })

    expect(screen.getByRole('alert')).toHaveTextContent('HB_ALLOWED_UIDS')
  })

  it('weist auf übersprungene Einträge hin', () => {
    zeigen({ skipped: 3 })

    expect(screen.getByText(/3 Einträge wurden übersprungen/)).toBeInTheDocument()
  })

  it('liest den Katalog auf Wunsch neu ein, wenn kein Dienst erreichbar ist', async () => {
    // Ohne Client bleibt nur das, was die App schon hat.
    const value = zeigen({ refresh: vi.fn(), client: null })

    await userEvent.click(screen.getByRole('button', { name: 'Neue Hörbücher suchen' }))

    expect(value.refresh).toHaveBeenCalled()
  })
})

describe('Neue Hörbücher suchen', () => {
  // Zwischen zwei Blicken auf den Dienst liegen drei Sekunden. Die will hier
  // niemand wirklich abwarten.
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function suchen(): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: 'Neue Hörbücher suchen' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
  }

  it('lässt das NAS die Ordner lesen und meldet den Zuwachs', async () => {
    // Genau der Fall, für den der Knopf da ist: Ein neuer Ordner liegt auf dem
    // NAS, der Dienst weiss noch nichts davon.
    const client = makeClient([
      status({ books: 9 }),
      status({ scanning: true }),
      status({ books: 12 }),
    ])
    const value = zeigen({ client, refresh: vi.fn() })

    await suchen()

    expect(screen.getByText(/3 neue Hörbücher/)).toBeInTheDocument()
    expect(client.startRescan).toHaveBeenCalled()
    // Erst nach dem Scan ist das Neuladen des Katalogs überhaupt sinnvoll.
    expect(value.refresh).toHaveBeenCalled()
  })

  it('sagt es auch, wenn nichts dazugekommen ist', async () => {
    const client = makeClient([status({ books: 10 }), status({ books: 10 })])
    zeigen({ client })

    await suchen()

    expect(screen.getByText(/nichts Neues gefunden/)).toBeInTheDocument()
  })

  it('behauptet nicht „fertig", wenn der Scan nichts hinterlassen hat', async () => {
    // Scheitert der Scan auf dem NAS, steht `scanning` wieder auf false und
    // der alte Katalog bleibt stehen. Ohne diesen Blick auf den Zeitstempel
    // läse man „nichts Neues gefunden" und suchte den Fehler beim Ordner.
    const stehengeblieben = status({ books: 10 })
    const client = makeClient([stehengeblieben, { ...stehengeblieben }])
    const value = zeigen({ client, refresh: vi.fn() })

    await suchen()

    expect(screen.getByRole('alert')).toHaveTextContent('nicht abgeschlossen')
    expect(value.refresh).not.toHaveBeenCalled()
  })

  it('zeigt bei fehlender Berechtigung auf die richtige Variable', async () => {
    // HB_ALLOWED_UIDS wäre hier die falsche Fährte: Hören darf das Konto.
    const client = makeClient([status()], {
      startRescan: vi
        .fn<MediaClient['startRescan']>()
        .mockRejectedValue(new MediaRequestError('forbidden')),
    })
    zeigen({ client })

    await suchen()

    expect(screen.getByRole('alert')).toHaveTextContent('HB_ADMIN_UIDS')
  })

  it('übersteht einen einzelnen Aussetzer während des Scans', async () => {
    // Ein NAS, das mitten im Lesen einmal nicht antwortet, ist kein Grund,
    // den ganzen Vorgang für gescheitert zu erklären.
    let blicke = 0
    const client = makeClient([status()], {
      fetchStatus: vi.fn<MediaClient['fetchStatus']>().mockImplementation(() => {
        blicke += 1
        if (blicke === 2) return Promise.reject(new MediaRequestError('offline'))
        return Promise.resolve(status({ books: blicke === 1 ? 10 : 11 }))
      }),
    })
    zeigen({ client })

    await suchen()

    expect(screen.getByText(/1 neues Hörbuch/)).toBeInTheDocument()
  })
})
