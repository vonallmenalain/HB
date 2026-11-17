import { describe, expect, it } from 'vitest'

import { makeBook } from '@/test/renderWithProfiles'

import { chapterProgress } from './chapterProgress'

const BUCH = makeBook({
  durationSec: 1800,
  chapters: [
    { idx: 0, title: 'Vorspann', fileIdx: 0, startSec: 0, endSec: 60 },
    { idx: 1, title: 'Erstes Kapitel', fileIdx: 1, startSec: 60, endSec: 600 },
    { idx: 2, title: 'Zweites Kapitel', fileIdx: 2, startSec: 600, endSec: 1800 },
  ],
})

describe('chapterProgress', () => {
  it('misst die Stelle vom Anfang des Kapitels an', () => {
    expect(chapterProgress(BUCH, 129)).toEqual({
      startSec: 60,
      lengthSec: 540,
      positionSec: 69,
      number: 2,
      count: 3,
    })
  })

  it('beginnt an der Grenze das nächste Kapitel bei null', () => {
    expect(chapterProgress(BUCH, 600)).toMatchObject({ number: 3, positionSec: 0 })
  })

  it('bleibt am Ende des Buchs im letzten Kapitel', () => {
    expect(chapterProgress(BUCH, 1800)).toMatchObject({ number: 3, positionSec: 1200 })
    expect(chapterProgress(BUCH, 5000)).toMatchObject({ number: 3, positionSec: 1200 })
  })

  it('übersteht Unsinn aus dem Audio-Element', () => {
    // NaN kommt, bevor die Metadaten geladen sind.
    expect(chapterProgress(BUCH, Number.NaN)).toMatchObject({ number: 1, positionSec: 0 })
    expect(chapterProgress(BUCH, -5)).toMatchObject({ number: 1, positionSec: 0 })
  })

  it('nimmt ein Buch ohne Kapitel als ein einziges', () => {
    const ohne = makeBook({ durationSec: 900, chapters: [] })
    expect(chapterProgress(ohne, 300)).toEqual({
      startSec: 0,
      lengthSec: 900,
      positionSec: 300,
      number: 1,
      count: 1,
    })
  })
})
