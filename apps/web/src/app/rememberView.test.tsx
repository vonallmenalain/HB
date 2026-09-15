import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { AppRoutes } from '@/app/AppRoutes'
import {
  makeBook,
  makeLibraryValue,
  makeProfile,
  makeProfilesValue,
  renderWithProfiles,
} from '@/test/renderWithProfiles'

const EMMA = makeProfile()
const profile = () => makeProfilesValue({ profiles: [EMMA], selected: EMMA })
const library = () => makeLibraryValue({ books: [makeBook({ id: 'b_1' })] })

describe('Ansicht über den Neustart merken', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('führt beim Start dorthin zurück, wo zuletzt geblättert wurde', () => {
    window.localStorage.setItem('hb.view', '/bibliothek')

    renderWithProfiles(<AppRoutes />, profile(), { route: '/', library: library() })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Alle Hörbücher')
  })

  it('lässt einen gezielten Aufruf in Ruhe', () => {
    // Wer über einen Link oder den Sperrbildschirm irgendwo anders aufmacht,
    // soll dort landen – nicht dort, wo er gestern aufgehört hat.
    window.localStorage.setItem('hb.view', '/bibliothek')

    renderWithProfiles(<AppRoutes />, profile(), { route: '/buch/b_1', library: library() })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Der Super-Papagei')
  })

  it('merkt sich die besuchte Ansicht', () => {
    renderWithProfiles(<AppRoutes />, profile(), { route: '/bibliothek', library: library() })

    expect(window.localStorage.getItem('hb.view')).toBe('/bibliothek')
  })
})
