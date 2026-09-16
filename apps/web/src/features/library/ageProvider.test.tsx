import { render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext } from '@/features/auth/authContext'
import { makeAuthValue } from '@/test/renderWithProfiles'

import { AgeProvider } from './AgeProvider'
import { type AgesContextValue, useAges } from './agesContext'

const commit = vi.fn()
const batchSet = vi.fn()
const batchDelete = vi.fn()
/** Ein Stapel je `writeBatch`-Aufruf – daran hängt die Prüfung der Grösse. */
const stapel: { set: number; delete: number }[] = []

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => ({ path: args.slice(1).join('/') }),
  doc: (_db: unknown, ...rest: string[]) => ({ path: rest.join('/') }),
  onSnapshot: (_ref: unknown, next: (snapshot: { docs: unknown[] }) => void) => {
    next({ docs: [] })
    return () => undefined
  },
  writeBatch: () => {
    const eigener = { set: 0, delete: 0 }
    stapel.push(eigener)
    return {
      set: (...args: unknown[]) => {
        eigener.set += 1
        batchSet(...args)
      },
      delete: (...args: unknown[]) => {
        eigener.delete += 1
        batchDelete(...args)
      },
      commit: () => commit() as unknown,
    }
  },
}))

vi.mock('@/lib/firebase', () => ({ getFirebase: () => ({ db: {} }) }))
vi.mock('@/lib/env', () => ({ readFirebaseConfig: () => ({ ok: true, config: {} }) }))

/** Reicht die Schreibfunktionen aus dem Provider nach draussen. */
function Probe({ melden }: { melden: (werte: AgesContextValue) => void }) {
  const werte = useAges()
  useEffect(() => {
    melden(werte)
  }, [werte, melden])
  return null
}

function zeigen(): AgesContextValue {
  let gemeldet: AgesContextValue | null = null
  render(
    <AuthContext value={makeAuthValue()}>
      <AgeProvider>
        <Probe
          melden={(werte) => {
            gemeldet = werte
          }}
        />
      </AgeProvider>
    </AuthContext>,
  )
  if (gemeldet === null) throw new Error('Der Provider hat nichts herausgegeben')
  return gemeldet
}

describe('Altersfreigaben schreiben', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stapel.length = 0
    commit.mockResolvedValue(undefined)
  })

  it('schreibt eine ganze Reihe in Stapeln, nicht als tausend Einzelaufrufe', async () => {
    // Firestore hört bei 500 Schreibvorgängen je Stapel auf. Tausend Folgen
    // sind deshalb drei Netzgänge – und nicht tausend, die gleichzeitig
    // losrennen.
    const { setMinAges } = zeigen()

    await setMinAges(
      Array.from({ length: 1000 }, (_, index) => `b_${String(index)}`),
      10,
    )

    await waitFor(() => {
      expect(commit).toHaveBeenCalledTimes(3)
    })
    expect(stapel.map((eintrag) => eintrag.set)).toEqual([400, 400, 200])
    expect(batchSet).toHaveBeenCalledTimes(1000)
    expect(batchDelete).not.toHaveBeenCalled()
  })

  it('löscht die Einträge, wenn die Freigabe wegfällt', async () => {
    // Kein Dokument heisst „frei" – statt einer Null, die jedes Gerät mitliest.
    const { setMinAges } = zeigen()

    await setMinAges(['b_1', 'b_2'], 0)

    expect(batchDelete).toHaveBeenCalledTimes(2)
    expect(batchSet).not.toHaveBeenCalled()
  })

  it('gibt allen Folgen denselben Zeitstempel', async () => {
    // Sie sind mit einer Handlung entstanden.
    const { setMinAges } = zeigen()

    await setMinAges(['b_1', 'b_2', 'b_3'], 12)

    const zeiten = new Set(
      batchSet.mock.calls.map((aufruf) => (aufruf[1] as { updatedAt: string }).updatedAt),
    )
    expect(zeiten.size).toBe(1)
  })

  it('nimmt für ein einzelnes Buch denselben Weg', async () => {
    const { setMinAge } = zeigen()

    await setMinAge('b_1', 8)

    expect(commit).toHaveBeenCalledTimes(1)
    expect(batchSet).toHaveBeenCalledWith(
      { path: `bookAges/b_1` },
      expect.objectContaining({ minAge: 8 }),
    )
  })

  it('weist eine unsinnige Stufe als „frei" ab', async () => {
    const { setMinAges } = zeigen()

    await setMinAges(['b_1'], 99)

    expect(batchDelete).toHaveBeenCalledTimes(1)
    expect(batchSet).not.toHaveBeenCalled()
  })

  it('schreibt für eine leere Liste gar nichts', async () => {
    const { setMinAges } = zeigen()

    await setMinAges([], 10)

    expect(commit).not.toHaveBeenCalled()
  })
})
