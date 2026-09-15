import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LONG_PRESS_MS } from './useLongPress'
import { ParentEntry } from './ParentEntry'

function zeigen() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<ParentEntry>Hörbücher</ParentEntry>} />
        <Route path="/eltern" element={<p>Elternbereich</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const warten = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

const titel = () => screen.getByRole('heading', { level: 1 })

describe('Eingang zum Elternbereich', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('bleibt eine Überschrift', () => {
    // Die naheliegende Lösung wäre, den Titel zu einem Knopf zu machen. Dann
    // verlöre die Seite ihre Hauptüberschrift – und wer die App vorgelesen
    // bekommt, fände sich nicht mehr zurecht.
    zeigen()

    expect(titel()).toHaveTextContent('Hörbücher')
  })

  it('öffnet nach zwei Sekunden Druck', () => {
    zeigen()

    fireEvent.pointerDown(titel())
    warten(LONG_PRESS_MS + 50)

    expect(screen.getByText('Elternbereich')).toBeInTheDocument()
  })

  it('öffnet bei kurzem Antippen nicht', () => {
    // Der ganze Sinn: Ein Kind, das auf den Titel tippt, landet nirgends.
    zeigen()

    fireEvent.pointerDown(titel())
    warten(500)
    fireEvent.pointerUp(titel())
    warten(LONG_PRESS_MS)

    expect(screen.queryByText('Elternbereich')).not.toBeInTheDocument()
  })

  it('bricht ab, wenn der Finger wegrutscht', () => {
    zeigen()

    fireEvent.pointerDown(titel())
    warten(500)
    fireEvent.pointerLeave(titel())
    warten(LONG_PRESS_MS)

    expect(screen.queryByText('Elternbereich')).not.toBeInTheDocument()
  })

  it('bleibt über die Tastatur erreichbar', () => {
    // Ein Eingang, den nur der Finger kennt, wäre für Tastatur und
    // Vorleseprogramm gar keiner.
    zeigen()

    fireEvent.click(screen.getByRole('button', { name: 'Elternbereich öffnen' }))

    expect(screen.getByText('Elternbereich')).toBeInTheDocument()
  })

})
