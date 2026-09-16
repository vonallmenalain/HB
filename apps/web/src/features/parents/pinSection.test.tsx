import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '@/app/AppRoutes'
import {
  makeParentsValue,
  makeProfile,
  makeProfilesValue,
  renderWithProfiles,
} from '@/test/renderWithProfiles'

const EMMA = makeProfile({ name: 'Emma' })

function zeigen(parents = makeParentsValue()) {
  renderWithProfiles(
    <AppRoutes />,
    makeProfilesValue({ profiles: [EMMA], selected: EMMA }),
    { route: '/eltern', parents },
  )
}

describe('Eltern-PIN', () => {
  it('sagt, wenn dieses Gerät die PIN gemerkt hat', () => {
    // Ohne diesen Hinweis wüsste niemand, warum der Elternbereich auf einem
    // Gerät ohne Eingabe aufgeht – und ob das so gemeint war.
    zeigen(makeParentsValue({ remembered: true }))

    expect(screen.getByText(/Auf diesem Gerät ist die PIN gemerkt/)).toBeInTheDocument()
  })

  it('nimmt das Gemerkte wieder zurück', async () => {
    const forgetOnThisDevice = vi.fn()
    zeigen(makeParentsValue({ remembered: true, forgetOnThisDevice }))

    await userEvent.click(
      screen.getByRole('button', { name: 'Auf diesem Gerät wieder sperren' }),
    )
    expect(forgetOnThisDevice).toHaveBeenCalled()
  })

  it('bietet das Zurücknehmen nur an, wenn es etwas zurückzunehmen gibt', () => {
    zeigen()

    expect(
      screen.queryByRole('button', { name: 'Auf diesem Gerät wieder sperren' }),
    ).not.toBeInTheDocument()
  })
})
