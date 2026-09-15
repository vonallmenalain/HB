import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LibraryContext, type LibraryContextValue } from '@/features/library/libraryContext'
import { makeBook, makeLibraryValue } from '@/test/renderWithProfiles'

import { LibrarySection } from './LibrarySection'

function zeigen(overrides: Partial<LibraryContextValue> = {}) {
  const value = makeLibraryValue({ books: [makeBook()], ...overrides })
  render(
    <LibraryContext value={value}>
      <LibrarySection />
    </LibraryContext>,
  )
  return value
}

describe('Bibliothek im Elternbereich', () => {
  it('sagt, wie viele Hörbücher vom NAS kamen', () => {
    zeigen({ books: [makeBook({ id: 'a' }), makeBook({ id: 'b' })] })

    expect(screen.getByText(/2 Hörbücher vom NAS/)).toBeInTheDocument()
  })

  it('nennt einen zu alten Medien-Dienst beim Namen', () => {
    // Ohne Reihen im Katalog sieht die Bibliothek aus, als wäre jedes Hörbuch
    // eine eigene Reihe. Wer das sieht, sucht den Fehler sonst in der App.
    zeigen({ schemaVersion: 1 })

    expect(screen.getByText(/älter als die App/)).toBeInTheDocument()
    expect(screen.getByText(/neu bauen/)).toBeInTheDocument()
  })

  it('schweigt, solange der Dienst aktuell ist', () => {
    zeigen({ schemaVersion: 2 })

    expect(screen.queryByText(/älter als die App/)).not.toBeInTheDocument()
  })

  it('macht kenntlich, wenn nur der letzte Stand gezeigt wird', () => {
    // Beantwortet die Frage, warum ein neues Hörbuch nicht auftaucht.
    zeigen({ fromCache: true })

    expect(screen.getByText(/letzten bekannten Stand/)).toBeInTheDocument()
  })

  it('nennt den Fehler im Klartext', () => {
    // Hier lesen Eltern, nicht Kinder – „403" hilft niemandem, der Satz schon.
    zeigen({ error: 'forbidden' })

    expect(screen.getByRole('alert')).toHaveTextContent('HB_ALLOWED_UIDS')
  })

  it('weist auf übersprungene Einträge hin', () => {
    zeigen({ skipped: 3 })

    expect(screen.getByText(/3 Einträge wurden übersprungen/)).toBeInTheDocument()
  })

  it('liest den Katalog auf Wunsch neu ein', async () => {
    const value = zeigen({ refresh: vi.fn() })

    await userEvent.click(screen.getByRole('button', { name: 'Katalog neu einlesen' }))

    expect(value.refresh).toHaveBeenCalled()
  })
})
