import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'

describe('App ohne Firebase-Konfiguration', () => {
  beforeEach(() => {
    // Ausdrücklich leeren statt sich darauf zu verlassen, dass gerade keine
    // .env.local herumliegt – sonst hängt der Test an der Umgebung des
    // Entwicklungsrechners.
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', '')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '')
    vi.stubEnv('VITE_FIREBASE_APP_ID', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('nennt die fehlenden Variablen, statt mit einem Firebase-Fehler abzustürzen', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Konfiguration fehlt')
    expect(screen.getByText('VITE_FIREBASE_API_KEY')).toBeInTheDocument()
    expect(screen.getByText('VITE_FIREBASE_AUTH_DOMAIN')).toBeInTheDocument()
    expect(screen.getByText('VITE_FIREBASE_PROJECT_ID')).toBeInTheDocument()
    expect(screen.getByText('VITE_FIREBASE_APP_ID')).toBeInTheDocument()
  })
})
