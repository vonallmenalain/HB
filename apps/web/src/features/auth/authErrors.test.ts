import { describe, expect, it } from 'vitest'

import { authErrorMessage } from './authErrors'

describe('authErrorMessage', () => {
  it('übersetzt bekannte Codes', () => {
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toBe(
      'E-Mail-Adresse oder Passwort stimmen nicht.',
    )
    expect(authErrorMessage({ code: 'auth/network-request-failed' })).toBe(
      'Keine Verbindung. Ist das Gerät online?',
    )
  })

  it('nennt unbekannte Codes, statt sie zu verschlucken', () => {
    expect(authErrorMessage({ code: 'auth/etwas-neues' })).toBe(
      'Anmeldung fehlgeschlagen (auth/etwas-neues).',
    )
  })

  it('kommt mit allem klar, was kein Firebase-Fehler ist', () => {
    expect(authErrorMessage(new Error('kaputt'))).toBe('Unbekannter Fehler bei der Anmeldung.')
    expect(authErrorMessage(null)).toBe('Unbekannter Fehler bei der Anmeldung.')
    expect(authErrorMessage('boom')).toBe('Unbekannter Fehler bei der Anmeldung.')
    expect(authErrorMessage({ code: 42 })).toBe('Unbekannter Fehler bei der Anmeldung.')
  })
})
