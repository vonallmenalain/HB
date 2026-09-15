import { describe, expect, it } from 'vitest'

import { makeBook, makeDownloadRecord } from '@/test/renderWithProfiles'

import {
  downloadRatio,
  emptyRecord,
  formatBytes,
  isBusy,
  isDownloaded,
  matchesCatalog,
  totalBytes,
} from './downloads'

describe('totalBytes', () => {
  it('zählt alle Dateien zusammen', () => {
    const book = makeBook({
      files: [
        { idx: 0, durationSec: 10, bytes: 1000, mime: 'audio/mpeg' },
        { idx: 1, durationSec: 10, bytes: 2000, mime: 'audio/mpeg' },
      ],
    })

    expect(totalBytes(book)).toBe(3000)
  })

  it('lässt sich von unsinnigen Angaben nicht ins Minus ziehen', () => {
    const book = makeBook({
      files: [{ idx: 0, durationSec: 10, bytes: -5, mime: 'audio/mpeg' }],
    })

    expect(totalBytes(book)).toBe(0)
  })
})

describe('downloadRatio', () => {
  it('rechnet in Bytes', () => {
    expect(downloadRatio(makeDownloadRecord({ status: 'running', bytesDone: 250, bytesTotal: 1000 }))).toBe(
      0.25,
    )
  })

  it('ist bei „fertig" voll, auch wenn die Bytes nicht genau aufgehen', () => {
    // Die Grössen im Katalog stammen vom NAS; die tatsächlich geladenen Bytes
    // können minimal abweichen. Ein Balken bei 99 % wäre dann falsch.
    expect(downloadRatio(makeDownloadRecord({ bytesDone: 990, bytesTotal: 1000 }))).toBe(1)
  })

  it('weicht auf Dateien aus, wenn keine Grössen bekannt sind', () => {
    expect(
      downloadRatio(
        makeDownloadRecord({
          status: 'running',
          bytesTotal: 0,
          filesTotal: 4,
          filesDone: 1,
        }),
      ),
    ).toBe(0.25)
  })

  it('bleibt ohne Stand bei null', () => {
    expect(downloadRatio(null)).toBe(0)
  })
})

describe('matchesCatalog', () => {
  it('erkennt ein neu kodiertes Buch', () => {
    // Nach einem Neu-Kodieren auf dem NAS liegen im Cache Dateien einer
    // anderen Fassung. Sie sind noch da – aber nicht mehr das, was das Kind
    // hören würde.
    const book = makeBook({ filesHash: 'neu' })

    expect(matchesCatalog(makeDownloadRecord({ filesHash: 'alt' }), book)).toBe(false)
    expect(matchesCatalog(makeDownloadRecord({ filesHash: 'neu' }), book)).toBe(true)
  })

  it('erkennt ein dazugekommenes Kapitel', () => {
    const book = makeBook({
      files: [
        { idx: 0, durationSec: 10, bytes: 1, mime: 'audio/mpeg' },
        { idx: 1, durationSec: 10, bytes: 1, mime: 'audio/mpeg' },
      ],
    })

    expect(matchesCatalog(makeDownloadRecord({ filesTotal: 1 }), book)).toBe(false)
  })

  it('sagt ohne Stand nein', () => {
    expect(matchesCatalog(null, makeBook())).toBe(false)
  })
})

describe('emptyRecord', () => {
  it('beschreibt das Buch, noch bevor etwas geladen wurde', () => {
    const book = makeBook({
      filesHash: 'xyz',
      files: [
        { idx: 0, durationSec: 10, bytes: 400, mime: 'audio/mpeg' },
        { idx: 1, durationSec: 10, bytes: 600, mime: 'audio/mpeg' },
      ],
    })

    expect(emptyRecord(book, () => new Date('2026-01-01T00:00:00.000Z'))).toEqual({
      bookId: 'b_1',
      status: 'idle',
      filesTotal: 2,
      filesDone: 0,
      bytesTotal: 1000,
      bytesDone: 0,
      filesHash: 'xyz',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  })
})

describe('Zustände', () => {
  it.each([
    ['queued', true],
    ['running', true],
    ['idle', false],
    ['done', false],
    ['failed', false],
  ] as const)('isBusy(%s) = %s', (status, expected) => {
    expect(isBusy(makeDownloadRecord({ status }))).toBe(expected)
  })

  it('isDownloaded gilt nur für „fertig"', () => {
    expect(isDownloaded(makeDownloadRecord({ status: 'done' }))).toBe(true)
    expect(isDownloaded(makeDownloadRecord({ status: 'running' }))).toBe(false)
    expect(isDownloaded(null)).toBe(false)
  })
})

describe('formatBytes', () => {
  it.each([
    [0, '0 MB'],
    [-1, '0 MB'],
    [400_000, '<1 MB'],
    [25_000_000, '25 MB'],
    [999_000_000, '999 MB'],
    [1_200_000_000, '1,2 GB'],
  ])('%i → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })

  it('bleibt bei Unsinn stehen statt „NaN MB" zu zeigen', () => {
    expect(formatBytes(Number.NaN)).toBe('0 MB')
  })
})
