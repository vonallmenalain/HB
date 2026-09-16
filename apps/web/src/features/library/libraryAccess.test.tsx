import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext } from '@/features/auth/authContext'
import { ProfilesContext } from '@/features/profiles/profilesContext'
import {
  makeAgesValue,
  makeAuthValue,
  makeBook,
  makeProfile,
  makeProfilesValue,
  makeTitlesValue,
} from '@/test/renderWithProfiles'

import { AgesContext } from './agesContext'
import { LibraryProvider } from './LibraryProvider'
import { useLibrary } from './libraryContext'
import { TitlesContext } from './titlesContext'

const BOOKS = [
  makeBook({ id: 'frei', title: 'Der Super-Papagei', series: null, seriesIndex: null }),
  makeBook({ id: 'ab12', title: 'Der Feuerkelch', series: null, seriesIndex: null }),
]

vi.mock('@/lib/env', () => ({ readMediaBaseUrl: () => 'http://media.example' }))

vi.mock('./catalogCache', () => ({
  loadCachedCatalog: () => Promise.resolve(null),
  saveCachedCatalog: () => Promise.resolve(),
}))

vi.mock('./mediaClient', () => ({
  createMediaClient: () => ({
    fetchCatalog: () =>
      Promise.resolve({
        status: 'ok',
        etag: '"1"',
        skipped: 0,
        catalog: { schemaVersion: 2, generatedAt: '', books: BOOKS },
      }),
  }),
}))

/** Zeigt, was die Bibliothek herausgibt – einmal gefiltert, einmal ganz. */
function Probe() {
  const { books, allBooks, bookById } = useLibrary()
  return (
    <>
      <p data-testid="sichtbar">{books.map((book) => book.title).join(', ')}</p>
      <p data-testid="alle">{allBooks.map((book) => book.title).join(', ')}</p>
      <p data-testid="nachschlagen">{bookById('ab12')?.title ?? 'nicht gefunden'}</p>
    </>
  )
}

function zeigen(
  profile: ReturnType<typeof makeProfile> | null,
  ages: ReadonlyMap<string, number>,
) {
  return render(
    <AuthContext value={makeAuthValue()}>
      <TitlesContext value={makeTitlesValue()}>
        <AgesContext value={makeAgesValue({ ages })}>
          <ProfilesContext
            value={makeProfilesValue({
              profiles: profile === null ? [] : [profile],
              selected: profile,
            })}
          >
            <LibraryProvider>
              <Probe />
            </LibraryProvider>
          </ProfilesContext>
        </AgesContext>
      </TitlesContext>
    </AuthContext>,
  )
}

describe('Die Bibliothek gibt nur heraus, was das Kind sehen darf', () => {
  it('nimmt ein Hörbuch über dem Alter heraus – auch aus `bookById`', async () => {
    // `bookById` hängt bewusst an derselben Liste: Sonst liefe ein gesperrtes
    // Buch über eine gemerkte Adresse (`/buch/…`) oder über „Weiterhören"
    // doch noch an.
    zeigen(makeProfile({ ageYears: 8 }), new Map([['ab12', 12]]))

    await waitFor(() => {
      expect(screen.getByTestId('sichtbar')).toHaveTextContent('Der Super-Papagei')
    })
    expect(screen.getByTestId('sichtbar')).not.toHaveTextContent('Feuerkelch')
    expect(screen.getByTestId('nachschlagen')).toHaveTextContent('nicht gefunden')
  })

  it('behält den ganzen Katalog für den Eltern- und Adminbereich', async () => {
    zeigen(makeProfile({ ageYears: 8 }), new Map([['ab12', 12]]))

    await waitFor(() => {
      expect(screen.getByTestId('alle')).toHaveTextContent('Der Feuerkelch')
    })
  })

  it('gibt bei passendem Alter alles heraus', async () => {
    zeigen(makeProfile({ ageYears: 14 }), new Map([['ab12', 12]]))

    await waitFor(() => {
      expect(screen.getByTestId('sichtbar')).toHaveTextContent('Der Feuerkelch')
    })
  })

  it('nimmt ein einzeln gesperrtes Hörbuch heraus', async () => {
    zeigen(makeProfile({ ageYears: 14, blockedBooks: ['frei'] }), new Map())

    await waitFor(() => {
      expect(screen.getByTestId('alle')).toHaveTextContent('Der Super-Papagei')
    })
    expect(screen.getByTestId('sichtbar')).not.toHaveTextContent('Der Super-Papagei')
  })
})
