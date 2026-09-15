import { SignJWT } from 'jose'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MIN_SECRET_LENGTH, issueTicket, ticketKey, verifyTicket } from './ticket.js'

const SECRET = 'x'.repeat(MIN_SECRET_LENGTH)
const OTHER_SECRET = 'y'.repeat(MIN_SECRET_LENGTH)

afterEach(() => {
  vi.useRealTimers()
})

describe('ticketKey', () => {
  it('lehnt zu kurze Geheimnisse ab, statt sie stillschweigend zu nehmen', () => {
    expect(() => ticketKey('zu-kurz')).toThrow(/mindestens 32/)
  })

  it('nennt die tatsächliche Länge, damit der Fehler behebbar ist', () => {
    expect(() => ticketKey('abc')).toThrow(/hat 3/)
  })
})

describe('issueTicket / verifyTicket', () => {
  it('erkennt ein selbst ausgestelltes Ticket wieder', async () => {
    const { ticket } = await issueTicket(SECRET, 'uid-123', 3600)
    expect(await verifyTicket(SECRET, ticket)).toBe('uid-123')
  })

  it('meldet den Ablaufzeitpunkt als ISO-Zeitstempel', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { expiresAt } = await issueTicket(SECRET, 'uid-123', 8 * 3600)
    expect(expiresAt).toBe('2026-01-01T08:00:00.000Z')
  })

  it('lehnt ein Ticket mit fremdem Geheimnis ab', async () => {
    const { ticket } = await issueTicket(OTHER_SECRET, 'uid-123', 3600)
    expect(await verifyTicket(SECRET, ticket)).toBeNull()
  })

  it('lehnt ein abgelaufenes Ticket ab', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const { ticket } = await issueTicket(SECRET, 'uid-123', 60)

    vi.setSystemTime(new Date('2026-01-01T00:02:00.000Z'))
    expect(await verifyTicket(SECRET, ticket)).toBeNull()
  })

  it('lehnt ein verändertes Ticket ab', async () => {
    const { ticket } = await issueTicket(SECRET, 'uid-123', 3600)
    const parts = ticket.split('.')
    // Nutzlast austauschen, Signatur unverändert lassen.
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'fremde-uid' })).toString('base64url')
    expect(await verifyTicket(SECRET, `${parts[0]}.${forgedPayload}.${parts[2]}`)).toBeNull()
  })

  it('lehnt Unsinn ab, statt zu werfen', async () => {
    expect(await verifyTicket(SECRET, '')).toBeNull()
    expect(await verifyTicket(SECRET, 'kein.jwt')).toBeNull()
    expect(await verifyTicket(SECRET, 'a.b.c')).toBeNull()
  })

  it('lehnt ein Token mit alg=none ab', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: 'uid-123' })).toString('base64url')
    expect(await verifyTicket(SECRET, `${header}.${payload}.`)).toBeNull()
  })

  it('lehnt ein fremdes, aber richtig signiertes Token ab', async () => {
    // Gleicher Schlüssel, andere Herkunft: darf nicht als Ticket durchgehen.
    const foreign = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('uid-123')
      .setIssuer('jemand-anderes')
      .setAudience('hb-app')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET))

    expect(await verifyTicket(SECRET, foreign)).toBeNull()
  })

  it('lehnt ein Ticket ohne Subjekt ab', async () => {
    const withoutSubject = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('hb-media')
      .setAudience('hb-app')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET))

    expect(await verifyTicket(SECRET, withoutSubject)).toBeNull()
  })
})
