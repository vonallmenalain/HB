import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OFFEN_MS, SeekBar } from './SeekBar'

function zeigen(onSeek = vi.fn(), positionSec = 900, durationSec = 1800) {
  render(
    <SeekBar
      positionSec={positionSec}
      durationSec={durationSec}
      onSeek={onSeek}
      label="Stelle im Hörbuch"
    />,
  )
  return {
    onSeek,
    balken: () => screen.getByRole('slider', { name: 'Stelle im Hörbuch' }),
    riegel: () => screen.getByRole('button', { name: /^Spulen/ }),
  }
}

describe('SeekBar', () => {
  it('liegt gesperrt da und zeigt trotzdem die Stelle an', () => {
    const { balken } = zeigen()
    expect(balken()).toBeDisabled()
    expect(balken()).toHaveAttribute('aria-valuetext', '15:00 von 30:00')
  })

  it('gibt den Balken auf Tap frei und sperrt ihn auf einen zweiten wieder', () => {
    const { balken, riegel } = zeigen()

    fireEvent.click(riegel())
    expect(balken()).toBeEnabled()
    expect(riegel()).toHaveAccessibleName('Spulen wieder sperren')

    fireEvent.click(riegel())
    expect(balken()).toBeDisabled()
  })

  it('schliesst sich von selbst, wenn niemand ihn benutzt', () => {
    // Sonst wäre die Sperre nach dem ersten Mal für immer weg.
    vi.useFakeTimers()
    try {
      const { balken, riegel } = zeigen()
      fireEvent.click(riegel())
      expect(balken()).toBeEnabled()

      act(() => {
        vi.advanceTimersByTime(OFFEN_MS + 100)
      })
      expect(balken()).toBeDisabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('bleibt offen, solange jemand ihn bedient', () => {
    // Wer die Stelle noch sucht, darf nicht mitten im Suchen ausgesperrt werden.
    vi.useFakeTimers()
    try {
      const { balken, riegel } = zeigen()
      fireEvent.click(riegel())

      for (let i = 0; i < 3; i += 1) {
        act(() => {
          vi.advanceTimersByTime(OFFEN_MS - 1000)
        })
        fireEvent.change(balken(), { target: { value: String(1000 + i) } })
      }

      expect(balken()).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('springt erst beim Loslassen, nicht bei jedem Zwischenwert', () => {
    const { balken, riegel, onSeek } = zeigen()
    fireEvent.click(riegel())

    fireEvent.change(balken(), { target: { value: '1200' } })
    expect(onSeek).not.toHaveBeenCalled()

    fireEvent.pointerUp(balken())
    expect(onSeek).toHaveBeenCalledWith(1200)
  })

  it('folgt der Stelle stufenlos, statt auf fünf Sekunden einzurasten', () => {
    // Bei einem Kapitel von einer Minute waren fünf Sekunden ein Zwölftel der
    // Breite: Der Balken stand still und machte dann einen Satz.
    const { balken } = zeigen(vi.fn(), 23.6, 60)

    expect(balken()).toHaveValue('23.6')
    expect(balken().style.getPropertyValue('--seek-fill')).toMatch(/^39\.33/)
  })

  it('geht mit den Pfeiltasten fünf Sekunden weiter und springt beim Loslassen', () => {
    const { balken, riegel, onSeek } = zeigen()
    fireEvent.click(riegel())

    fireEvent.keyDown(balken(), { key: 'ArrowRight' })
    fireEvent.keyDown(balken(), { key: 'ArrowRight' })
    expect(onSeek).not.toHaveBeenCalled()

    fireEvent.keyUp(balken(), { key: 'ArrowRight' })
    expect(onSeek).toHaveBeenCalledWith(910)
  })

  it('folgt beim Ziehen dem Finger ohne Nachlauf', () => {
    const { balken, riegel } = zeigen()
    expect(balken()).not.toHaveAttribute('data-ziehen')

    fireEvent.click(riegel())
    fireEvent.change(balken(), { target: { value: '1200' } })
    expect(balken()).toHaveAttribute('data-ziehen')

    fireEvent.pointerUp(balken())
    expect(balken()).not.toHaveAttribute('data-ziehen')
  })
})
