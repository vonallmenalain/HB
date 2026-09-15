import { describe, expect, it } from 'vitest'

import { transferHinweis } from './transferHinweis'

describe('transferHinweis', () => {
  it('sagt bei einer laufenden Übergabe, dass die App zu sein darf', () => {
    expect(transferHinweis('background', true)).toMatch(/darf dabei zu sein/)
  })

  it('warnt, wenn der laufende Download die offene App braucht', () => {
    // Der Fall, auf den es ankommt: Das Gerät **kann** übergeben, hat diese
    // Übergabe aber abgelehnt – kein Platz, schon in der Schlange. „Die App
    // darf zu sein" wäre hier schlicht falsch.
    expect(transferHinweis('foreground', true)).toMatch(/Lass sie bitte offen/)
  })

  it('spricht ohne laufenden Download von der Möglichkeit, nicht von der Tat', () => {
    expect(transferHinweis(null, true)).toMatch(/kann Downloads dem Betriebssystem übergeben/)
  })

  it('ist ohne die Schnittstelle eindeutig', () => {
    expect(transferHinweis(null, false)).toBe(
      'Dieses Gerät lädt nur, solange die App offen ist.',
    )
  })
})
