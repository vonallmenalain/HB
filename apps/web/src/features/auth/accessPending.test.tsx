import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthValue } from '@/test/renderWithProfiles'

import { AccessPendingScreen } from './AccessPendingScreen'
import { AuthContext } from './authContext'

function zeigen(requested: boolean, recheckAccess = vi.fn().mockResolvedValue(undefined)) {
  const auth = makeAuthValue()
  return render(
    <AuthContext value={{ ...auth, actions: { ...auth.actions, recheckAccess } }}>
      <AccessPendingScreen uid="u_neu" email="oma@example.com" requested={requested} />
    </AuthContext>,
  )
}

describe('Warten auf Freigabe', () => {
  it('sagt, dass die Anfrage unterwegs ist – ohne Kennung zum Abtippen', () => {
    zeigen(true)

    expect(screen.getByText(/Anfrage ist unterwegs/)).toBeInTheDocument()
    expect(screen.getByText(/oma@example.com/)).toBeInTheDocument()
    expect(screen.queryByText('u_neu')).not.toBeInTheDocument()
  })

  it('zeigt die Kennung erst, wenn die Anfrage nicht abgelegt werden konnte', () => {
    // Dann ist sie keine Zumutung, sondern die einzige Angabe, mit der sich
    // das Problem von Hand lösen lässt.
    zeigen(false)

    expect(screen.getByText('u_neu')).toBeInTheDocument()
  })

  it('prüft auf Wunsch noch einmal nach', async () => {
    const recheckAccess = vi.fn().mockResolvedValue(undefined)
    zeigen(true, recheckAccess)

    await userEvent.click(screen.getByRole('button', { name: 'Nochmal prüfen' }))
    expect(recheckAccess).toHaveBeenCalled()
  })
})
