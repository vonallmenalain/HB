import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '@/app/AppRoutes'
import {
  makeAgesValue,
  makeAuthValue,
  makeBook,
  makeLibraryValue,
  makeProfile,
  makeProfilesValue,
  renderWithProfiles,
} from '@/test/renderWithProfiles'

const EMMA = makeProfile({ name: 'Emma' })

const BOOKS = [
  makeBook({ id: 'b_1', title: 'Der Stein der Weisen', series: 'Harry Potter', seriesIndex: 1 }),
  makeBook({ id: 'b_2', title: 'Der Feuerkelch', series: 'Harry Potter', seriesIndex: 4 }),
  makeBook({ id: 'b_3', title: 'Hexerei', series: 'Bibi Blocksberg', seriesIndex: null }),
]

function zeigen(setMinAge = vi.fn().mockResolvedValue(undefined), ages = new Map<string, number>()) {
  renderWithProfiles(
    <AppRoutes />,
    makeProfilesValue({ profiles: [EMMA], selected: EMMA }),
    {
      route: '/admin/alter',
      auth: makeAuthValue({ isAdmin: true }),
      library: makeLibraryValue({ books: BOOKS }),
      ages: makeAgesValue({ ages, setMinAge }),
    },
  )
  return setMinAge
}

describe('Altersfreigabe im Adminbereich', () => {
  it('zeigt erst nach der Suche eine Liste', async () => {
    // Neunhundert Hörbücher sind keine Übersicht, sondern ein Bildschirm, an
    // dem man vorbeiscrollt.
    zeigen()

    expect(screen.getByText(/Erst suchen/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Suchen'), 'Feuerkelch')
    expect(screen.getByText('04 - Der Feuerkelch')).toBeInTheDocument()
    expect(screen.queryByText('Hexerei')).not.toBeInTheDocument()
  })

  it('setzt eine Altersfreigabe für ein einzelnes Hörbuch', async () => {
    const setMinAge = zeigen()

    await userEvent.type(screen.getByLabelText('Suchen'), 'Feuerkelch')
    await userEvent.click(
      screen.getByRole('button', { name: '04 - Der Feuerkelch ab 12 Jahren' }),
    )

    expect(setMinAge).toHaveBeenCalledWith('b_2', 12)
  })

  it('nimmt eine Altersfreigabe wieder weg', async () => {
    const setMinAge = zeigen(undefined, new Map([['b_2', 12]]))

    await userEvent.type(screen.getByLabelText('Suchen'), 'Feuerkelch')
    expect(screen.getByText(/Ab 12 Jahren/)).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: '04 - Der Feuerkelch ohne Altersfreigabe' }),
    )
    expect(setMinAge).toHaveBeenCalledWith('b_2', 0)
  })

  it('setzt eine ganze Reihe auf einen Schlag', async () => {
    // Bei neunzig Folgen wäre neunzigmal dasselbe anzutippen keine Einstellung,
    // sondern eine Strafe.
    const setMinAge = zeigen()

    await userEvent.type(screen.getByLabelText('Suchen'), 'Harry Potter')
    await userEvent.click(screen.getByRole('button', { name: 'ab 12' }))

    expect(setMinAge).toHaveBeenCalledWith('b_1', 12)
    expect(setMinAge).toHaveBeenCalledWith('b_2', 12)
    expect(setMinAge).not.toHaveBeenCalledWith('b_3', 12)
  })

  it('sagt, wie viele Hörbücher überhaupt eine Freigabe haben', () => {
    zeigen(undefined, new Map([['b_2', 12]]))
    expect(screen.getByText('1 Hörbuch hat eine Altersfreigabe.')).toBeInTheDocument()
  })
})
