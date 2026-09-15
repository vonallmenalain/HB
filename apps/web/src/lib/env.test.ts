import { describe, expect, it } from 'vitest'

import { readFirebaseConfig, readMediaBaseUrl } from './env'

const complete = {
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'example',
  VITE_FIREBASE_APP_ID: '1:2:web:3',
}

describe('readFirebaseConfig', () => {
  it('liest eine vollständige Konfiguration', () => {
    const result = readFirebaseConfig(complete)
    expect(result).toEqual({
      ok: true,
      config: {
        apiKey: 'key',
        authDomain: 'example.firebaseapp.com',
        projectId: 'example',
        appId: '1:2:web:3',
      },
    })
  })

  it('nennt fehlende Variablen beim Namen', () => {
    const result = readFirebaseConfig({ VITE_FIREBASE_API_KEY: 'key' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.missing).toEqual([
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_APP_ID',
    ])
  })

  it('behandelt leere Werte wie fehlende', () => {
    // Netlify liefert nicht gesetzte Variablen als leeren String aus.
    const result = readFirebaseConfig({ ...complete, VITE_FIREBASE_APP_ID: '   ' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.missing).toEqual(['VITE_FIREBASE_APP_ID'])
  })

  it('schneidet Leerzeichen ab', () => {
    const result = readFirebaseConfig({ ...complete, VITE_FIREBASE_PROJECT_ID: ' example ' })
    expect(result.ok && result.config.projectId).toBe('example')
  })
})

describe('readMediaBaseUrl', () => {
  it('entfernt abschliessende Schrägstriche', () => {
    expect(readMediaBaseUrl({ VITE_MEDIA_BASE_URL: 'https://media.example.com/' })).toBe(
      'https://media.example.com',
    )
    expect(readMediaBaseUrl({ VITE_MEDIA_BASE_URL: 'https://media.example.com///' })).toBe(
      'https://media.example.com',
    )
  })

  it('liefert null, wenn nichts gesetzt ist', () => {
    expect(readMediaBaseUrl({})).toBeNull()
    expect(readMediaBaseUrl({ VITE_MEDIA_BASE_URL: '' })).toBeNull()
  })
})
