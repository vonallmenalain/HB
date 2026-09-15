import { describe, expect, it } from 'vitest'

import { ConfigError, readConfig } from './config.js'

const MINIMAL = {
  HB_MEDIA_ROOT: '/media',
  HB_FIREBASE_PROJECT_ID: 'hoerbuchkinder',
  HB_TICKET_SECRET: 'x'.repeat(32),
  HB_ALLOWED_ORIGINS: 'https://hb.example.com',
}

describe('readConfig', () => {
  it('füllt die Vorgaben, wenn nur das Nötige gesetzt ist', () => {
    const config = readConfig(MINIMAL)
    expect(config.port).toBe(8080)
    expect(config.host).toBe('0.0.0.0')
    expect(config.cacheDir).toBe('/cache')
    expect(config.ticketTtlSeconds).toBe(8 * 3600)
    expect(config.allowedUids).toEqual([])
    expect(config.scanOnStart).toBe(true)
  })

  it('zerlegt Listen und wirft Leerraum weg', () => {
    const config = readConfig({
      ...MINIMAL,
      HB_ALLOWED_ORIGINS: 'https://a.example.com, https://b.example.com ,',
      HB_ALLOWED_UIDS: ' uid-1 , uid-2 ',
    })
    expect(config.allowedOrigins).toEqual(['https://a.example.com', 'https://b.example.com'])
    expect(config.allowedUids).toEqual(['uid-1', 'uid-2'])
  })

  it('nennt alle Probleme auf einmal', () => {
    // Wer den Container einrichtet, soll nicht fünfmal neu starten müssen.
    try {
      readConfig({})
      expect.unreachable('sollte werfen')
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      const problems = (error as ConfigError).problems
      expect(problems).toHaveLength(4)
      expect(problems.join('\n')).toContain('HB_MEDIA_ROOT')
      expect(problems.join('\n')).toContain('HB_FIREBASE_PROJECT_ID')
      expect(problems.join('\n')).toContain('HB_TICKET_SECRET')
      expect(problems.join('\n')).toContain('HB_ALLOWED_ORIGINS')
    }
  })

  it('lehnt ein zu kurzes Ticket-Geheimnis ab und sagt, wie man eins erzeugt', () => {
    try {
      readConfig({ ...MINIMAL, HB_TICKET_SECRET: 'zu-kurz' })
      expect.unreachable('sollte werfen')
    } catch (error) {
      const message = (error as ConfigError).problems.join('\n')
      expect(message).toContain('mindestens 32')
      expect(message).toContain('openssl rand')
    }
  })

  it('lehnt unsinnige Zahlen ab', () => {
    expect(() => readConfig({ ...MINIMAL, HB_PORT: '0' })).toThrow(/HB_PORT/)
    expect(() => readConfig({ ...MINIMAL, HB_PORT: 'acht' })).toThrow(/HB_PORT/)
    expect(() => readConfig({ ...MINIMAL, HB_PORT: '80.5' })).toThrow(/HB_PORT/)
    expect(() => readConfig({ ...MINIMAL, HB_TICKET_TTL_SECONDS: '-1' })).toThrow(/TTL/)
  })

  it('lässt den Scan beim Start abschalten', () => {
    expect(readConfig({ ...MINIMAL, HB_SCAN_ON_START: 'false' }).scanOnStart).toBe(false)
    expect(readConfig({ ...MINIMAL, HB_SCAN_ON_START: 'true' }).scanOnStart).toBe(true)
  })
})

describe('Wiederholter Scan', () => {
  it('liest standardmässig alle sechs Stunden neu ein', () => {
    // Ohne das taucht ein neu abgelegtes Hörbuch erst nach einem Neustart auf.
    expect(readConfig(MINIMAL).rescanIntervalMinutes).toBe(360)
  })

  it('lässt sich mit 0 abschalten', () => {
    expect(
      readConfig({ ...MINIMAL, HB_RESCAN_INTERVAL_MINUTES: '0' }).rescanIntervalMinutes,
    ).toBe(0)
  })

  it('lehnt unsinnige Werte ab', () => {
    expect(() => readConfig({ ...MINIMAL, HB_RESCAN_INTERVAL_MINUTES: '-5' })).toThrow(/RESCAN/)
    expect(() => readConfig({ ...MINIMAL, HB_RESCAN_INTERVAL_MINUTES: 'täglich' })).toThrow(
      /RESCAN/,
    )
  })
})
