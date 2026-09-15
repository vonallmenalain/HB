import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '@/app/AppRoutes'
import {
  makeBook,
  makeFavoritesValue,
  makeLibraryValue,
  makeProfile,
  makeProfilesValue,
  renderWithProfiles,
} from '@/test/renderWithProfiles'

const EMMA = makeProfile()
const profiles = () => makeProfilesValue({ profiles: [EMMA], selected: EMMA })

const BOOKS = [
  makeBook({ id: 'b_1', title: 'Der Super-Papagei' }),
  makeBook({ id: 'b_2', title: 'Der Phantomsee', seriesIndex: 2 }),
]

describe('Favoriten', () => {
  it('merkt ein Buch mit einem Tipp auf den Stern', async () => {
    const toggle = vi.fn()

    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/buch/b_1',
      library: makeLibraryValue({ books: BOOKS }),
      favorites: makeFavoritesValue({ toggle }),
    })

    await userEvent.click(screen.getByRole('button', { name: 'Der Super-Papagei merken' }))
    expect(toggle).toHaveBeenCalledWith('b_1')
  })

  it('zeigt am gemerkten Buch einen gefüllten Stern', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/buch/b_1',
      library: makeLibraryValue({ books: BOOKS }),
      favorites: makeFavoritesValue({ ids: new Set(['b_1']) }),
    })

    const stern = screen.getByRole('button', { name: 'Der Super-Papagei nicht mehr merken' })
    expect(stern).toHaveAttribute('aria-pressed', 'true')
  })

  it('stellt das Gemerkte auf die Startseite', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: BOOKS }),
      favorites: makeFavoritesValue({ ids: new Set(['b_2']) }),
    })

    const abschnitt = screen.getByRole('heading', { name: 'Gemerkt' }).parentElement
    expect(abschnitt).not.toBeNull()
    expect(abschnitt?.textContent).toContain('Der Phantomsee')
  })

  it('lässt den Abschnitt weg, solange nichts gemerkt ist', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: BOOKS }),
    })

    expect(screen.queryByRole('heading', { name: 'Gemerkt' })).not.toBeInTheDocument()
  })
})
