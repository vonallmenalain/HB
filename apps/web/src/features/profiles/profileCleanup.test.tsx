import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { makeProfile } from '@/test/renderWithProfiles'

/**
 * Firestore löscht Unterkollektionen nicht mit dem Dokument.
 *
 * Der Elternbereich verspricht beim Löschen eines Profils ausdrücklich, dass
 * sein Fortschritt verschwindet – und seit den Favoriten hängt eine zweite
 * Unterkollektion daran. Wird eine vergessen, bleibt sie für immer liegen:
 * unsichtbar, unlöschbar über die App, und beim nächsten Profil mit derselben
 * Kennung wieder da.
 */
const geloescht: string[] = []
const batchDeletes: string[] = []

vi.mock('firebase/firestore', () => {
  const pfad = (...teile: unknown[]): string =>
    teile
      .slice(1)
      .map((teil) => (typeof teil === 'string' ? teil : String(teil)))
      .join('/')

  return {
    collection: (db: unknown, ...teile: string[]) => ({ path: pfad(db, ...teile) }),
    doc: (db: unknown, ...teile: string[]) => ({ path: pfad(db, ...teile) }),
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    setDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: (ref: { path: string }) => {
      geloescht.push(ref.path)
      return Promise.resolve()
    },
    getDocs: (ref: { path: string }) =>
      Promise.resolve({
        docs: [{ ref: { path: `${ref.path}/eintrag` } }],
      }),
    writeBatch: () => ({
      delete: (ref: { path: string }) => {
        batchDeletes.push(ref.path)
      },
      commit: () => Promise.resolve(),
    }),
    onSnapshot: (_ref: unknown, onNext: (snapshot: unknown) => void) => {
      onNext({ docs: [] })
      return () => undefined
    },
  }
})

vi.mock('@/lib/firebase', () => ({ getFirebase: () => ({ db: {} }) }))
vi.mock('@/lib/env', () => ({ readFirebaseConfig: () => ({ ok: true, config: {} }) }))
vi.mock('@/lib/db', () => ({ deleteProgressFor: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/features/auth/authContext', () => ({ useUser: () => ({ uid: 'u1' }) }))

const { ProfileProvider } = await import('./ProfileProvider')
const { useProfiles } = await import('./profilesContext')

function Loeschen() {
  const { remove } = useProfiles()
  return (
    <button
      type="button"
      onClick={() => {
        void remove(makeProfile().id)
      }}
    >
      Löschen
    </button>
  )
}

describe('Profil löschen', () => {
  it('räumt Fortschritt und Favoriten mit weg', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const { getByRole } = render(
      <ProfileProvider>
        <Loeschen />
      </ProfileProvider>,
    )

    await userEvent.click(getByRole('button', { name: 'Löschen' }))

    await waitFor(() => {
      expect(geloescht).toContain('users/u1/profiles/p1')
    })
    expect(batchDeletes).toContain('users/u1/profiles/p1/progress/eintrag')
    expect(batchDeletes).toContain('users/u1/profiles/p1/favorites/eintrag')
  })
})
