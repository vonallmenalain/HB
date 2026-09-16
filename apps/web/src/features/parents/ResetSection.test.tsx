import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ResetContext, type ResetContextValue } from './resetContext'
import { ResetSection } from './ResetSection'

function zeigen(overrides: Partial<ResetContextValue> = {}) {
  const resetAll =
    overrides.resetAll ??
    vi.fn<ResetContextValue['resetAll']>().mockResolvedValue({
      progress: 3,
      favorites: 2,
      history: 7,
    })
  render(
    <ResetContext value={{ resetAll }}>
      <ResetSection />
    </ResetContext>,
  )
  return resetAll
}

describe('Zurücksetzen im Elternbereich', () => {
  it('setzt nichts zurück, bevor die Rückfrage beantwortet ist', async () => {
    const resetAll = zeigen()

    await userEvent.click(screen.getByRole('button', { name: 'Alles zurücksetzen' }))

    expect(resetAll).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Wirklich alles zurücksetzen?')
  })

  it('lässt sich abbrechen', async () => {
    const resetAll = zeigen()

    await userEvent.click(screen.getByRole('button', { name: 'Alles zurücksetzen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(resetAll).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Alles zurücksetzen' })).toBeInTheDocument()
  })

  it('nennt hinterher, was weg ist', async () => {
    // „Hat es etwas getan?" ist die erste Frage nach so einem Knopf – und bei
    // einer leeren Startseite die einzige, die man noch beantworten kann.
    const resetAll = zeigen()

    await userEvent.click(screen.getByRole('button', { name: 'Alles zurücksetzen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ja, zurücksetzen' }))

    expect(resetAll).toHaveBeenCalled()
    expect(
      await screen.findByText(/3 Hörstände, 2 Sterne, 7 Einträge Historie/),
    ).toBeInTheDocument()
  })

  it('verschweigt die Historie, wenn dieses Konto sie nicht sieht', async () => {
    // Nur der Administrator darf sie überhaupt lesen – für alle anderen wäre
    // „0 Einträge Historie" eine Aussage über etwas, das sie nichts angeht.
    zeigen({
      resetAll: vi
        .fn<ResetContextValue['resetAll']>()
        .mockResolvedValue({ progress: 1, favorites: 0, history: null }),
    })

    await userEvent.click(screen.getByRole('button', { name: 'Alles zurücksetzen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ja, zurücksetzen' }))

    expect(await screen.findByText(/1 Hörstand, 0 Sterne\./)).toBeInTheDocument()
  })

  it('sagt es, wenn das Zurücksetzen scheitert', async () => {
    zeigen({
      resetAll: vi
        .fn<ResetContextValue['resetAll']>()
        .mockRejectedValue(new Error('keine Verbindung')),
    })

    await userEvent.click(screen.getByRole('button', { name: 'Alles zurücksetzen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ja, zurücksetzen' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('nicht durchgelaufen')
  })
})
