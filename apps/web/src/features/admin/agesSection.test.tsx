import { screen, within } from '@testing-library/react'
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

/** Eine Reihe mit mehr Folgen, als die Einzelliste zeigt. */
const FRAGEZEICHEN = Array.from({ length: 40 }, (_, index) =>
  makeBook({
    id: `f_${String(index)}`,
    title: index === 0 ? 'Weihnachten in Rocky Beach' : `Fall ${String(index)}`,
    series: 'Die drei ???',
    seriesIndex: index + 1,
  }),
)

const KIDS = [
  makeBook({ id: 'k_1', title: 'Chaos', series: 'Die drei ??? Kids', seriesIndex: 1 }),
  makeBook({ id: 'k_2', title: 'Alarm', series: 'Die drei ??? Kids', seriesIndex: 2 }),
]

const EINZELN = makeBook({
  id: 'e_1',
  title: 'Englisch',
  series: null,
  seriesIndex: null,
})

const BOOKS = [...FRAGEZEICHEN, ...KIDS, EINZELN]

function zeigen(
  setMinAges = vi.fn().mockResolvedValue(undefined),
  ages = new Map<string, number>(),
  setMinAge = vi.fn().mockResolvedValue(undefined),
) {
  renderWithProfiles(
    <AppRoutes />,
    makeProfilesValue({ profiles: [EMMA], selected: EMMA }),
    {
      route: '/admin/alter',
      auth: makeAuthValue({ isAdmin: true }),
      library: makeLibraryValue({ books: BOOKS }),
      ages: makeAgesValue({ ages, setMinAge, setMinAges }),
    },
  )
  return { setMinAges, setMinAge }
}

/** Die Karte einer Reihe – daran hängen ihre Knöpfe. */
function reihe(name: string): HTMLElement {
  const eintrag = screen.getByText(name).closest('li')
  if (!eintrag) throw new Error(`Reihe „${name}" hat keine Karte`)
  return eintrag
}

describe('Altersfreigabe im Adminbereich', () => {
  it('stellt jede Reihe mit ihrer Länge zur Wahl, auch ohne Suche', () => {
    // Die Liste der Reihen ist kurz genug, um darin zu suchen – die der
    // neunhundert Hörbücher nicht.
    zeigen()

    expect(within(reihe('Die drei ???')).getByText('40 Folgen')).toBeInTheDocument()
    expect(within(reihe('Die drei ??? Kids')).getByText('2 Folgen')).toBeInTheDocument()
  })

  it('setzt eine ganze Reihe auf einmal – nicht nur die gezeigten Folgen', async () => {
    // Genau der Fall, der vorher nicht ging: Hier stand ein Knopf „alle hier
    // gezeigten auf einmal", und der griff nur auf die ersten 25.
    const { setMinAges } = zeigen()

    await userEvent.click(
      within(reihe('Die drei ???')).getByRole('button', {
        name: 'Altersfreigabe für Die drei ??? ändern',
      }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Die drei ???: alle 40 ab 10 Jahren' }),
    )

    expect(setMinAges).toHaveBeenCalledTimes(1)
    const [ids, minAge] = setMinAges.mock.calls[0] as [string[], number]
    expect(ids).toHaveLength(40)
    expect(minAge).toBe(10)
  })

  it('nimmt eine Freigabe für die ganze Reihe wieder weg', async () => {
    const { setMinAges } = zeigen(
      undefined,
      new Map(FRAGEZEICHEN.map((book) => [book.id, 10])),
    )

    expect(within(reihe('Die drei ???')).getByText('Ab 10 Jahren')).toBeInTheDocument()

    await userEvent.click(
      within(reihe('Die drei ???')).getByRole('button', {
        name: 'Altersfreigabe für Die drei ??? ändern',
      }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Die drei ???: alle 40 ohne Altersfreigabe' }),
    )

    expect(setMinAges).toHaveBeenCalledWith(expect.arrayContaining(['f_0']), 0)
  })

  it('sagt, wenn in einer Reihe verschiedene Freigaben gelten', () => {
    // „Gemischt" allein liesse offen, was zu tun ist – die Stufen dazu sagen es.
    zeigen(undefined, new Map([['k_1', 8]]))

    expect(within(reihe('Die drei ??? Kids')).getByText('Gemischt: ohne, ab 8')).toBeInTheDocument()
  })

  it('setzt bei einer Suche nur die Treffer der Reihe', async () => {
    // Wer „Weihnachten" sucht und dort auf „ab 12" tippt, meint die eine
    // Weihnachtsfolge und nicht zweihundert.
    const { setMinAges } = zeigen()

    await userEvent.type(screen.getByLabelText('Reihe oder Hörbuch suchen'), 'Weihnachten')
    expect(within(reihe('Die drei ???')).getByText('1 von 40 Folgen')).toBeInTheDocument()

    await userEvent.click(
      within(reihe('Die drei ???')).getByRole('button', {
        name: 'Altersfreigabe für Die drei ??? ändern',
      }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Die drei ???: alle 1 ab 12 Jahren' }),
    )

    expect(setMinAges).toHaveBeenCalledWith(['f_0'], 12)
  })

  it('findet über den Reihennamen alle ihre Folgen', async () => {
    zeigen()

    await userEvent.type(screen.getByLabelText('Reihe oder Hörbuch suchen'), 'Die drei ???')
    expect(within(reihe('Die drei ???')).getByText('40 Folgen')).toBeInTheDocument()
    expect(within(reihe('Die drei ??? Kids')).getByText('2 Folgen')).toBeInTheDocument()
  })

  it('zeigt einzelne Hörbücher erst nach der Suche', async () => {
    // Neunhundert Hörbücher sind keine Übersicht, sondern ein Bildschirm, an
    // dem man vorbeiscrollt.
    zeigen()

    expect(screen.getByText(/Erst suchen/)).toBeInTheDocument()
    expect(screen.queryByText('Englisch')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Reihe oder Hörbuch suchen'), 'Englisch')
    expect(screen.getByText('Englisch')).toBeInTheDocument()
  })

  it('setzt ein Hörbuch ohne Reihe einzeln', async () => {
    // Für ein Buch ohne Reihe gibt es keine Reihenkarte – die Einzelliste ist
    // hier der einzige Weg.
    const { setMinAge } = zeigen()

    await userEvent.type(screen.getByLabelText('Reihe oder Hörbuch suchen'), 'Englisch')
    await userEvent.click(screen.getByRole('button', { name: 'Englisch ab 6 Jahren' }))

    expect(setMinAge).toHaveBeenCalledWith('e_1', 6)
  })

  it('sagt nach dem Setzen, wie viele es waren', async () => {
    zeigen()

    await userEvent.click(
      within(reihe('Die drei ???')).getByRole('button', {
        name: 'Altersfreigabe für Die drei ??? ändern',
      }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Die drei ???: alle 40 ab 10 Jahren' }),
    )

    expect(
      await screen.findByText('40 Hörbücher stehen jetzt ab 10 Jahren.'),
    ).toBeInTheDocument()
  })

  it('sagt, wie viele Hörbücher überhaupt eine Freigabe haben', () => {
    zeigen(undefined, new Map([['k_1', 12]]))
    expect(screen.getByText('1 von 43 Hörbüchern haben eine Altersfreigabe.')).toBeInTheDocument()
  })
})
