import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { makePlayerValue } from '@/test/renderWithProfiles'

import { PlayerContext, type PlayerContextValue } from './playerContext'
import { SleepTimerButton } from './SleepTimerButton'

function show(overrides: Partial<PlayerContextValue> = {}) {
  const value = makePlayerValue(overrides)
  render(
    <PlayerContext value={value}>
      <SleepTimerButton />
    </PlayerContext>,
  )
  return value
}

describe('Einschlaf-Timer im Player', () => {
  it('stellt die Stufen aus dem Konzept zur Wahl', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Einschlaf-Timer stellen' }))

    for (const minuten of [5, 10, 15, 30, 45, 60]) {
      expect(
        screen.getByRole('button', { name: `${String(minuten)} Minuten` }),
      ).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Bis zum Kapitelende' })).toBeInTheDocument()
  })

  it('gibt die Wahl weiter und schliesst sich', async () => {
    const value = show()
    await userEvent.click(screen.getByRole('button', { name: 'Einschlaf-Timer stellen' }))
    await userEvent.click(screen.getByRole('button', { name: '30 Minuten' }))

    expect(value.setSleep).toHaveBeenCalledWith({ kind: 'minutes', minutes: 30 })
    expect(screen.queryByRole('button', { name: '30 Minuten' })).not.toBeInTheDocument()
  })

  it('zeigt die Restzeit, sobald einer läuft', () => {
    // „Restzeit gross sichtbar" – die Antwort auf „wie lange noch, bis Ruhe ist".
    show({ sleepMode: { kind: 'minutes', minutes: 15 }, sleepRemainingSec: 754 })

    expect(screen.getByRole('button', { name: /noch 12:34/ })).toHaveTextContent('12:34')
  })

  it('lässt sich wieder abschalten', async () => {
    const value = show({ sleepMode: { kind: 'chapter' }, sleepRemainingSec: 90 })
    await userEvent.click(screen.getByRole('button', { name: /Einschlaf-Timer/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Timer ausschalten' }))

    expect(value.setSleep).toHaveBeenCalledWith(null)
  })

  it('bietet das Ausschalten nicht an, solange keiner läuft', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Einschlaf-Timer stellen' }))

    expect(screen.queryByRole('button', { name: 'Timer ausschalten' })).not.toBeInTheDocument()
  })

  it('nennt den Zustand auch ohne Bild', () => {
    // Das Mond-Symbol allein sagt einer Vorleseansage nichts.
    show({ sleepMode: { kind: 'minutes', minutes: 5 }, sleepRemainingSec: 300 })

    expect(screen.getByRole('button', { name: 'Einschlaf-Timer: noch 5:00' })).toBeInTheDocument()
  })

  it('lässt sich mit Escape wieder schliessen', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Einschlaf-Timer stellen' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('schliesst, wenn jemand daneben tippt', async () => {
    // Für ein Kind, das versehentlich hierherkommt, der naheliegendste Ausweg.
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Einschlaf-Timer stellen' }))

    await userEvent.click(screen.getByRole('button', { name: 'Einschlaf-Timer schliessen' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
