import { describe, expect, it } from 'vitest'

import { parseStructure } from './settings.js'

describe('parseStructure', () => {
  it('liest, was der Adminbereich geschrieben hat', () => {
    expect([
      ...parseStructure({
        'Die Drei Ausrufezeichen': 'einzelfolgen',
        'Reihe/Buch': 'einBuch',
      }),
    ]).toEqual([
      ['Die Drei Ausrufezeichen', 'einzelfolgen'],
      ['Reihe/Buch', 'einBuch'],
    ])
  })

  it('übergeht Einträge, die keinen Sinn ergeben', () => {
    // Die Datei liegt im Cache-Volume und lässt sich von Hand ändern. Ein
    // Tippfehler darf den Scan nicht aufhalten – er gilt dann einfach nicht.
    expect([...parseStructure({ Ordner: 'vielleicht', '': 'einBuch', Zahl: 3 })]).toEqual([])
  })

  it('kommt mit Unsinn klar', () => {
    expect([...parseStructure(null)]).toEqual([])
    expect([...parseStructure('kaputt')]).toEqual([])
  })
})
