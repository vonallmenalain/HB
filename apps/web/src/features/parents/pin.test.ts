import { describe, expect, it } from 'vitest'

import {
  PIN_LENGTH,
  checkPin,
  hashPin,
  isValidPin,
  makeStoredPin,
  parseStoredPin,
  randomSalt,
  verifyPin,
} from './pin'

describe('isValidPin', () => {
  it.each([
    ['1357', true],
    ['0000', true],
    ['123', false],
    ['12345', false],
    ['12a4', false],
    ['', false],
    [' 123', false],
  ])('%s → %s', (pin, erwartet) => {
    expect(isValidPin(pin)).toBe(erwartet)
  })
})

describe('checkPin', () => {
  it('lässt eine brauchbare PIN durch', () => {
    expect(checkPin('2739')).toBeNull()
  })

  it('weist die ersten beiden Versuche jedes Kindes ab', () => {
    expect(checkPin('1234')).not.toBeNull()
    expect(checkPin('0000')).not.toBeNull()
    expect(checkPin('7777')).not.toBeNull()
  })

  it('sagt, was fehlt, statt nur nein', () => {
    expect(checkPin('12')).toContain(String(PIN_LENGTH))
  })
})

describe('hashPin', () => {
  it('liefert zu gleicher PIN und gleichem Salz dasselbe', async () => {
    const salt = randomSalt()

    expect(await hashPin('2739', salt)).toBe(await hashPin('2739', salt))
  })

  it('liefert zu gleichem PIN bei anderem Salz etwas anderes', async () => {
    // Sonst verriete ein Blick in die Datenbank, welche Familien dieselbe PIN
    // benutzen.
    expect(await hashPin('2739', randomSalt())).not.toBe(await hashPin('2739', randomSalt()))
  })

  it('speichert die PIN nirgends im Klartext', async () => {
    const stored = await makeStoredPin('2739')

    expect(stored.hash).not.toContain('2739')
    expect(stored.salt).not.toContain('2739')
    expect(stored.hash.length).toBeGreaterThan(32)
  })
})

describe('verifyPin', () => {
  it('erkennt die richtige PIN', async () => {
    const stored = await makeStoredPin('2739')

    expect(await verifyPin('2739', stored)).toBe(true)
  })

  it('weist jede andere ab', async () => {
    const stored = await makeStoredPin('2739')

    expect(await verifyPin('2738', stored)).toBe(false)
    expect(await verifyPin('273', stored)).toBe(false)
    expect(await verifyPin('', stored)).toBe(false)
  })

  it('sagt ohne hinterlegte PIN nein', async () => {
    // Ob dann überhaupt gesperrt wird, entscheidet eine Ebene höher – hier
    // wäre „ja" schlicht gelogen.
    expect(await verifyPin('2739', null)).toBe(false)
  })
})

describe('parseStoredPin', () => {
  it('liest ein vollständiges Dokument', () => {
    expect(parseStoredPin({ pinSalt: 'ab', pinHash: 'cd', uid: 'u' })).toEqual({
      salt: 'ab',
      hash: 'cd',
    })
  })

  it.each([
    ['ohne PIN', { uid: 'u' }],
    ['halb gespeichert', { pinSalt: 'ab' }],
    ['leer geräumt', { pinSalt: '', pinHash: '' }],
    ['kein Objekt', 'kaputt'],
    ['null', null],
  ])('sagt bei %s: keine PIN', (_name, data) => {
    expect(parseStoredPin(data)).toBeNull()
  })
})
