import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfilesContext } from '@/features/profiles/profilesContext'
import { makeProfile, makeProfilesValue, makeProgressEntry } from '@/test/renderWithProfiles'

import { type ProgressCloud } from './cloud'
import { ProgressStore } from './ProgressProvider'
import { type Progress } from './progress'
import { useProgress } from './progressContext'

vi.mock('@/lib/db', () => ({
  readAllProgress: vi.fn(),
  writeProgress: vi.fn(),
  deleteProgressFor: vi.fn(),
}))

const { readAllProgress, writeProgress } = await import('@/lib/db')

const ALT = '2026-01-01T10:00:00.000Z'
const NEU = '2026-01-08T10:00:00.000Z'

/**
 * Eine Cloud aus Papier: Sie merkt sich, was hineingeschrieben wurde, und
 * lässt den Test bestimmen, was von „aussen" hereinkommt. Firestore selbst ist
 * für diese Fragen unerheblich – geprüft wird die Verdrahtung.
 */
function fakeCloud() {
  let onEntries: ((entries: ReadonlyMap<string, Progress>, complete: boolean) => void) | null =
    null
  let onError: (() => void) | null = null
  const written: Progress[] = []

  const cloud: ProgressCloud = {
    subscribe(entriesHandler, errorHandler) {
      onEntries = entriesHandler
      onError = errorHandler
      return () => {
        onEntries = null
        onError = null
      }
    },
    write(progress) {
      written.push(progress)
    },
  }

  return {
    cloud,
    written,
    subscribed: () => onEntries !== null,
    emit(entries: readonly Progress[], complete = true) {
      act(() => {
        onEntries?.(
          new Map(entries.map((entry) => [entry.bookId, entry])),
          complete,
        )
      })
    },
    fail() {
      act(() => {
        onError?.()
      })
    },
  }
}

function Show({ toSave }: { toSave?: Progress | undefined }) {
  const { entries, loading, syncState, save } = useProgress()
  return (
    <div>
      <span data-testid="sync">{syncState}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="position">{entries.get('b_1')?.positionSec ?? '–'}</span>
      <span data-testid="count">{entries.size}</span>
      <button
        type="button"
        onClick={() => {
          if (toSave) save(toSave)
        }}
      >
        speichern
      </button>
    </div>
  )
}

function renderStore(
  cloud: ProgressCloud | null,
  { profileId = 'p1', toSave }: { profileId?: string; toSave?: Progress } = {},
) {
  const profiles = makeProfilesValue({ selected: makeProfile({ id: profileId }) })
  return render(
    <ProfilesContext value={profiles}>
      <ProgressStore cloudFor={cloud === null ? undefined : () => cloud}>
        <Show toSave={toSave} />
      </ProgressStore>
    </ProfilesContext>,
  )
}

/** Wartet, bis der lokale Stand gelesen ist – erst danach kommt die Cloud dazu. */
async function localReady(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })
}

/**
 * Wartet, bis die Cloud-Seite tatsächlich zuhört.
 *
 * Nur „nicht mehr am Laden" genügt nicht: Der Effekt, der sich anmeldet, läuft
 * erst nach dem Rendern. Ohne diese Schranke könnte ein Schnappschuss ins
 * Leere gehen – und der Test wäre grün, ohne etwas geprüft zu haben.
 */
async function listening(remote: { subscribed: () => boolean }): Promise<void> {
  await localReady()
  await waitFor(() => {
    expect(remote.subscribed()).toBe(true)
  })
}

describe('Fortschritt zwischen Geräten', () => {
  beforeEach(() => {
    vi.mocked(readAllProgress).mockResolvedValue([])
    vi.mocked(writeProgress).mockResolvedValue(undefined)
    vi.mocked(writeProgress).mockClear()
  })

  it('hört erst zu, wenn der lokale Stand steht', async () => {
    // Andersherum sähe das Zusammenführen ein leeres Gerät und hielte alles
    // aus der Cloud für neu – der lokale Stand wäre für den Abgleich weg.
    const remote = fakeCloud()
    renderStore(remote.cloud)

    expect(remote.subscribed()).toBe(false)

    // Der Effekt, der sich anmeldet, läuft erst nach dem Rendern – deshalb
    // hier warten statt sofort prüfen.
    await listening(remote)
  })

  it('zeigt die Stelle vom anderen Gerät an und merkt sie sich lokal', async () => {
    const remote = fakeCloud()
    renderStore(remote.cloud)
    await listening(remote)

    const vomTablet = makeProgressEntry({ positionSec: 420, updatedAt: NEU })
    remote.emit([vomTablet])

    expect(screen.getByTestId('position')).toHaveTextContent('420')
    expect(writeProgress).toHaveBeenCalledWith('p1', vomTablet)
  })

  it('legt einen überholten Stand in der Cloud wieder hin', async () => {
    // Das Gerät, das den jüngeren Stand hat, repariert die Cloud von selbst.
    const hier = makeProgressEntry({ positionSec: 400, updatedAt: NEU })
    vi.mocked(readAllProgress).mockResolvedValue([hier])

    const remote = fakeCloud()
    renderStore(remote.cloud)
    await listening(remote)

    const veraltet = makeProgressEntry({ positionSec: 20, updatedAt: ALT })
    remote.emit([veraltet])

    expect(screen.getByTestId('position')).toHaveTextContent('400')
    expect(remote.written).toEqual([hier])
    // Der alte Stand darf auch lokal nichts überschreiben.
    expect(writeProgress).not.toHaveBeenCalledWith('p1', veraltet)
  })

  it('schiebt lokale Bücher erst nach, wenn die Cloud-Seite vollständig ist', async () => {
    const hier = makeProgressEntry({ positionSec: 400, updatedAt: ALT })
    vi.mocked(readAllProgress).mockResolvedValue([hier])

    const remote = fakeCloud()
    renderStore(remote.cloud)
    await listening(remote)

    // Aus dem Zwischenspeicher – sagt nichts darüber, was beim Server liegt.
    remote.emit([], false)
    expect(remote.written).toEqual([])

    remote.emit([], true)
    expect(remote.written).toEqual([hier])
  })

  it('schreibt einen gespeicherten Stand sofort in die Cloud', async () => {
    const remote = fakeCloud()
    const stand = makeProgressEntry({ positionSec: 42, updatedAt: NEU })
    renderStore(remote.cloud, { toSave: stand })
    await listening(remote)
    remote.emit([])

    await userEvent.click(screen.getByRole('button', { name: 'speichern' }))

    expect(screen.getByTestId('position')).toHaveTextContent('42')
    expect(writeProgress).toHaveBeenCalledWith('p1', stand)
    expect(remote.written).toEqual([stand])
  })

  it('macht aus dem eigenen Schreibvorgang keine Endlosschleife', async () => {
    const remote = fakeCloud()
    const stand = makeProgressEntry({ positionSec: 42, updatedAt: NEU })
    renderStore(remote.cloud, { toSave: stand })
    await listening(remote)
    remote.emit([])

    await userEvent.click(screen.getByRole('button', { name: 'speichern' }))
    // Firestore meldet jeden Schreibvorgang sofort zurück.
    remote.emit([{ ...stand }])

    expect(remote.written).toHaveLength(1)
  })

  it('meldet den Zustand des Abgleichs', async () => {
    const remote = fakeCloud()
    renderStore(remote.cloud)

    await listening(remote)
    expect(screen.getByTestId('sync')).toHaveTextContent('connecting')

    // Ein Schnappschuss aus dem Zwischenspeicher ist noch kein Abgleich.
    remote.emit([], false)
    expect(screen.getByTestId('sync')).toHaveTextContent('connecting')

    remote.emit([], true)
    expect(screen.getByTestId('sync')).toHaveTextContent('live')
  })

  it('meldet einen gescheiterten Abgleich, ohne den Fortschritt anzuhalten', async () => {
    const remote = fakeCloud()
    const stand = makeProgressEntry({ positionSec: 42 })
    renderStore(remote.cloud, { toSave: stand })
    await listening(remote)

    remote.fail()
    expect(screen.getByTestId('sync')).toHaveTextContent('error')

    await userEvent.click(screen.getByRole('button', { name: 'speichern' }))
    expect(screen.getByTestId('position')).toHaveTextContent('42')
    expect(writeProgress).toHaveBeenCalledWith('p1', stand)
  })

  it('arbeitet ohne Cloud unverändert weiter', async () => {
    const stand = makeProgressEntry({ positionSec: 42 })
    renderStore(null, { toSave: stand })
    await localReady()

    expect(screen.getByTestId('sync')).toHaveTextContent('off')

    await userEvent.click(screen.getByRole('button', { name: 'speichern' }))
    expect(screen.getByTestId('position')).toHaveTextContent('42')
    expect(writeProgress).toHaveBeenCalledWith('p1', stand)
  })

  it('verliert nichts, was während des Ladens gespeichert wurde', async () => {
    // Das Lesen aus IndexedDB kann losgelaufen sein, bevor die neue Stelle
    // geschrieben wurde – dann kennt die Antwort sie nicht.
    let liefereLokal = (entries: Progress[]) => {
      void entries
    }
    vi.mocked(readAllProgress).mockReturnValue(
      new Promise<Progress[]>((resolve) => {
        liefereLokal = resolve
      }),
    )

    const stand = makeProgressEntry({ positionSec: 42, updatedAt: NEU })
    renderStore(null, { toSave: stand })

    await userEvent.click(screen.getByRole('button', { name: 'speichern' }))
    expect(writeProgress).toHaveBeenCalledWith('p1', stand)

    await act(async () => {
      liefereLokal([makeProgressEntry({ positionSec: 5, updatedAt: ALT })])
      await Promise.resolve()
    })

    await localReady()
    expect(screen.getByTestId('position')).toHaveTextContent('42')
  })

  it('bringt den Fortschritt eines anderen Profils nicht durcheinander', async () => {
    const remote = fakeCloud()
    const { rerender } = renderStore(remote.cloud)
    await listening(remote)
    remote.emit([makeProgressEntry({ positionSec: 420, updatedAt: NEU })])
    expect(screen.getByTestId('count')).toHaveTextContent('1')

    vi.mocked(readAllProgress).mockResolvedValue([])
    rerender(
      <ProfilesContext value={makeProfilesValue({ selected: makeProfile({ id: 'p2' }) })}>
        <ProgressStore cloudFor={() => remote.cloud}>
          <Show />
        </ProgressStore>
      </ProfilesContext>,
    )

    // Noch vor dem Neuladen: Der Stand des alten Profils ist sofort weg.
    expect(screen.getByTestId('count')).toHaveTextContent('0')
    await localReady()
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })
})
