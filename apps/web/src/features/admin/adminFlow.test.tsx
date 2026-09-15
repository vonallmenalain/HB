import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AdminScreen } from '@/routes/AdminScreen'
import { type AccessRequest } from '@/features/auth/accessRequest'
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
