import { describe, expect, it } from 'vitest'

import {
  parseAccessRequest,
  parseAllowedAccount,
  sortRequests,
  toRequestDoc,
} from './accessRequest'

describe('toRequestDoc', () => {
  it('schreibt nur, was die Regeln zulassen', () => {
    const doc = toRequestDoc('u1', 'kind@example.com', 'Kind', () => new Date(0))

    expect(doc).toEqual({
      uid: 'u1',
      email: 'kind@example.com',
      name: 'Kind',
      requestedAt: '1970-01-01T00:00:00.000Z',
      status: 'pending',
    })
  })

  it('lässt leere Felder ganz weg', () => {
    // Die Regeln lassen genau fünf Schlüssel zu und keine leeren Angaben –
    // ein `null` würde das Schreiben scheitern lassen.
    const doc = toRequestDoc('u1', null, '  ')
    expect(Object.keys(doc).sort()).toEqual(['requestedAt', 'status', 'uid'])
  })
})

describe('parseAccessRequest', () => {
  it('liest Name und Adresse', () => {
    const request = parseAccessRequest('u1', {
      email: 'kind@example.com',
      name: 'Kind',
      requestedAt: '2026-01-01T00:00:00.000Z',
      status: 'pending',
    })

    expect(request).toEqual({
      uid: 'u1',
      email: 'kind@example.com',
      name: 'Kind',
      requestedAt: '2026-01-01T00:00:00.000Z',
      status: 'pending',
    })
  })

  it('hält auch ein halb geschriebenes Dokument aus', () => {
    // Der Inhalt kommt von einem fremden Gerät – er darf den Adminbereich
    // nicht zum Absturz bringen.
    expect(parseAccessRequest('u1', { email: 42 })).toEqual({
      uid: 'u1',
      email: null,
      name: null,
      requestedAt: '',
      status: 'pending',
    })
    expect(parseAccessRequest('u1', null)).toBeNull()
  })
})

describe('sortRequests', () => {
  it('stellt offene Anfragen nach vorn, die jüngste zuerst', () => {
    const requests = sortRequests([
      { uid: 'alt', email: null, name: null, requestedAt: '2026-01-01', status: 'pending' },
      { uid: 'weg', email: null, name: null, requestedAt: '2026-03-01', status: 'denied' },
      { uid: 'neu', email: null, name: null, requestedAt: '2026-02-01', status: 'pending' },
    ])

    expect(requests.map((request) => request.uid)).toEqual(['neu', 'alt', 'weg'])
  })
})

describe('parseAllowedAccount', () => {
  it('erkennt das Administratorkonto an seiner Rolle', () => {
    expect(parseAllowedAccount('u1', { role: 'admin' }).admin).toBe(true)
    expect(parseAllowedAccount('u2', { note: 'Papa' }).admin).toBe(false)
  })
})
