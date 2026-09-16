import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { makeBook, makePlayerValue } from '@/test/renderWithProfiles'

import { NowPlayingBar } from './NowPlayingBar'
import { PlayerContext, type PlayerContextValue } from './playerContext'

const BOOK = makeBook({ id: 'b_1', title: 'Der Super-Papagei' })

function show(overrides: Partial<PlayerContextValue> = {}, route = '/') {
  const value = makePlayerValue({ book: BOOK, playing: true, ...overrides })
  render(
    <MemoryRouter initialEntries={[route]}>
      <PlayerContext value={value}>
        <NowPlayingBar />
      </PlayerContext>
    </MemoryRouter>,
  )
  return value
}

describe('Leiste am unteren Rand', () => {
  it('hält an und macht zu, wenn das Viereck gedrückt wird', async () => {
    // Pause allein liesse die Leiste stehen; das Viereck räumt sie weg – ohne
    // dass man dafür erst den Player aufmachen muss.
    const value = show()

    await userEvent.click(screen.getByRole('button', { name: 'Anhalten und schliessen' }))

    expect(value.stop).toHaveBeenCalled()
    expect(value.toggle).not.toHaveBeenCalled()
  })

  it('lässt Pause und Weiterhören daneben unverändert', async () => {
    const laufend = show()
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(laufend.toggle).toHaveBeenCalled()
    expect(laufend.stop).not.toHaveBeenCalled()
  })

  it('bietet das Viereck auch in der Pause an', () => {
    show({ playing: false })

    expect(screen.getByRole('button', { name: 'Weiterhören' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anhalten und schliessen' })).toBeInTheDocument()
  })

  it('lässt den Titel schrumpfen, statt die Knöpfe aus dem Bild zu schieben', () => {
    // Zwei 64px-Knöpfe passen neben den Titel nur, wenn der Link schrumpfen
    // darf. Ohne `min-w-0` ist seine kleinste Breite die volle Titelbreite –
    // und dann steht der äusserste Knopf auf einem Handy neben dem Bildschirm.
    // In jsdom wird nichts gerechnet; geprüft wird deshalb die Ursache.
    show({ book: makeBook({ title: 'Ein ziemlich langer Hörbuchtitel mit Untertitel' }) })

    const link = screen.getByRole('link')
    expect(link.className).toContain('min-w-0')
    expect(screen.getByText('Ein ziemlich langer Hörbuchtitel mit Untertitel').className).toContain(
      'truncate',
    )
  })

  it('bleibt im Player selbst weg – dort steht das Viereck schon', () => {
    show({}, '/player/b_1')

    expect(screen.queryByRole('button', { name: 'Anhalten und schliessen' })).not.toBeInTheDocument()
  })
})
