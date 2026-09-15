import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('zeigt den Startbildschirm', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hörbücher')
    expect(screen.getByText('Noch keine Hörbücher')).toBeInTheDocument()
  })

  it('verlinkt von der Startseite in die Bibliothek', () => {
    render(<App />)

    const link = screen.getByRole('link', { name: 'Alle Hörbücher' })
    expect(link).toHaveAttribute('href', '/bibliothek')
  })

  it('zeigt für unbekannte Adressen einen Weg zurück statt eines Fehlers', () => {
    window.history.pushState({}, '', '/gibtesnicht')
    render(<App />)

    expect(screen.getByText('Hier ist nichts')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zum Anfang' })).toHaveAttribute('href', '/')

    window.history.pushState({}, '', '/')
  })
})
