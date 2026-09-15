import { beforeEach, describe, expect, it } from 'vitest'

import { lastView, rememberView } from './lastView'

describe('Zuletzt gesehene Ansicht', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it.each(['/bibliothek', '/bibliothek/die-drei-kids', '/buch/b_1'])(
    'merkt sich %s',
    (pfad) => {
      rememberView(pfad)

      expect(lastView()).toBe(pfad)
    },
  )

  it('macht aus dem Player die Buchseite', () => {
    // Den Player wiederherzustellen hiesse, dass die App von selbst zu spielen
    // anfängt, sobald jemand sie antippt. Dieselbe Stelle, nur ohne Ton.
    rememberView('/player/b_1')

    expect(lastView()).toBe('/buch/b_1')
  })

  it('merkt sich den Startbildschirm nicht als Ziel', () => {
    // Dorthin kommt man ohnehin; ein Eintrag dafür wäre nur Arbeit.
    rememberView('/bibliothek')
    rememberView('/')

    expect(lastView()).toBeNull()
  })

  it.each(['/eltern', '/profil', '/irgendwas'])('merkt sich %s nicht', (pfad) => {
    // Elternbereich und Profilauswahl sind keine Orte zum Zurückkehren – beim
    // Öffnen soll das Kind seine Hörbücher sehen.
    rememberView('/bibliothek')
    rememberView(pfad)

    expect(lastView()).toBe('/bibliothek')
  })

  it('gibt nichts zurück, solange nichts gemerkt wurde', () => {
    expect(lastView()).toBeNull()
  })

  it('ignoriert Unsinn im Speicher', () => {
    window.localStorage.setItem('hb.view', 'javascript:alert(1)')

    expect(lastView()).toBeNull()
  })
})
