import { describe, expect, it } from 'vitest'

import { MEDIA_CACHE, bookIdFromFetchId, canonicalKey, fetchIdFor } from './mediaKeys'

describe('canonicalKey', () => {
  it('nimmt das Ticket heraus', () => {
    // Daran hängt alles: Das Ticket wechselt alle paar Stunden. Wäre es Teil
    // des Schlüssels, wäre jeder Download am nächsten Tag wertlos.
    expect(canonicalKey('https://nas.example/audio/b_1/0?t=abc')).toBe(
      'https://nas.example/audio/b_1/0',
    )
  })

  it('lässt alles andere stehen', () => {
    // Das `?v=` am Cover gehört zur Sache: Es wechselt, wenn sich das Bild
    // ändert – und dann soll auch der Eintrag im Cache ein anderer sein.
    expect(canonicalKey('https://nas.example/cover/b_1.jpg?v=9&t=abc')).toBe(
      'https://nas.example/cover/b_1.jpg?v=9',
    )
  })

  it('ändert eine Adresse ohne Ticket nicht', () => {
    const url = 'https://nas.example/audio/b_1/0'

    expect(canonicalKey(url)).toBe(url)
  })

  it('ist mit sich selbst verträglich', () => {
    // Zweimal anwenden muss dasselbe ergeben – sonst legte der Service Worker
    // unter einem anderen Schlüssel ab als die App sucht.
    const einmal = canonicalKey('https://nas.example/cover/b_1.jpg?v=9&t=abc')

    expect(canonicalKey(einmal)).toBe(einmal)
  })

  it('gibt Unsinn unverändert zurück, statt zu werfen', () => {
    expect(canonicalKey('kein/url')).toBe('kein/url')
  })
})

describe('Kennung für die Übergabe ans Betriebssystem', () => {
  it('lässt sich hin und zurück übersetzen', () => {
    expect(bookIdFromFetchId(fetchIdFor('b_1'))).toBe('b_1')
  })

  it('erkennt fremde Kennungen', () => {
    // In der Schlange des Browsers können auch Übergaben anderer Anwendungen
    // stehen – die gehen uns nichts an.
    expect(bookIdFromFetchId('etwas-anderes')).toBeNull()
  })
})

describe('Cache-Name', () => {
  it('ist an einer einzigen Stelle festgelegt', () => {
    // App und Service Worker müssen denselben benutzen, sonst legt der eine
    // ab, was der andere nicht findet.
    expect(MEDIA_CACHE).toBe('hb-media-v1')
  })
})
