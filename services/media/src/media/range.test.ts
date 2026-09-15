import { describe, expect, it } from 'vitest'

import { contentRange, parseRange, unsatisfiedContentRange } from './range.js'

const SIZE = 1000

describe('parseRange – ganze Datei', () => {
  it('liefert full ohne Header', () => {
    expect(parseRange(undefined, SIZE)).toEqual({ kind: 'full' })
  })

  it('ignoriert andere Einheiten als bytes', () => {
    // RFC 9110: unbekannte Einheiten werden ignoriert, nicht abgelehnt.
    expect(parseRange('items=0-10', SIZE)).toEqual({ kind: 'full' })
  })

  it('ignoriert kaputte Angaben, statt 416 zu senden', () => {
    expect(parseRange('bytes=abc', SIZE)).toEqual({ kind: 'full' })
    expect(parseRange('bytes=', SIZE)).toEqual({ kind: 'full' })
    expect(parseRange('bytes=-', SIZE)).toEqual({ kind: 'full' })
    expect(parseRange('bytes=1-2-3', SIZE)).toEqual({ kind: 'full' })
  })

  it('schickt bei mehreren Bereichen die ganze Datei', () => {
    expect(parseRange('bytes=0-99,200-299', SIZE)).toEqual({ kind: 'full' })
  })

  it('akzeptiert Grossschreibung und Leerzeichen', () => {
    expect(parseRange('  BYTES=0-99 ', SIZE)).toEqual({ kind: 'partial', start: 0, end: 99 })
  })
})

describe('parseRange – Teilbereiche', () => {
  it('liest einen geschlossenen Bereich', () => {
    expect(parseRange('bytes=100-199', SIZE)).toEqual({ kind: 'partial', start: 100, end: 199 })
  })

  it('ergänzt ein fehlendes Ende mit dem Dateiende', () => {
    // Genau das schickt ein <audio>-Element beim ersten Zugriff.
    expect(parseRange('bytes=0-', SIZE)).toEqual({ kind: 'partial', start: 0, end: 999 })
    expect(parseRange('bytes=500-', SIZE)).toEqual({ kind: 'partial', start: 500, end: 999 })
  })

  it('kürzt ein zu grosses Ende auf das Dateiende', () => {
    expect(parseRange('bytes=900-5000', SIZE)).toEqual({ kind: 'partial', start: 900, end: 999 })
  })

  it('liest die Suffix-Form als letzte N Bytes', () => {
    // Browser holen so den Schluss einer Datei, etwa für ID3v1-Tags.
    expect(parseRange('bytes=-500', SIZE)).toEqual({ kind: 'partial', start: 500, end: 999 })
  })

  it('begrenzt ein zu grosses Suffix auf die ganze Datei', () => {
    expect(parseRange('bytes=-5000', SIZE)).toEqual({ kind: 'partial', start: 0, end: 999 })
  })

  it('erlaubt ein einzelnes letztes Byte', () => {
    expect(parseRange('bytes=999-999', SIZE)).toEqual({ kind: 'partial', start: 999, end: 999 })
    expect(parseRange('bytes=-1', SIZE)).toEqual({ kind: 'partial', start: 999, end: 999 })
  })
})

describe('parseRange – unerfüllbar', () => {
  it('lehnt einen Anfang hinter dem Dateiende ab', () => {
    expect(parseRange('bytes=1000-', SIZE)).toEqual({ kind: 'unsatisfiable' })
    expect(parseRange('bytes=2000-3000', SIZE)).toEqual({ kind: 'unsatisfiable' })
  })

  it('lehnt ein Ende vor dem Anfang ab', () => {
    expect(parseRange('bytes=500-100', SIZE)).toEqual({ kind: 'unsatisfiable' })
  })

  it('lehnt ein Null-Suffix ab', () => {
    expect(parseRange('bytes=-0', SIZE)).toEqual({ kind: 'unsatisfiable' })
  })

  it('kann mit leeren Dateien umgehen', () => {
    expect(parseRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' })
    expect(parseRange('bytes=-10', 0)).toEqual({ kind: 'unsatisfiable' })
    expect(parseRange(undefined, 0)).toEqual({ kind: 'full' })
  })
})

describe('Content-Range-Werte', () => {
  it('formatiert eine Teilantwort', () => {
    expect(contentRange(0, 99, 1000)).toBe('bytes 0-99/1000')
  })

  it('formatiert eine 416-Antwort', () => {
    expect(unsatisfiedContentRange(1000)).toBe('bytes */1000')
  })
})
