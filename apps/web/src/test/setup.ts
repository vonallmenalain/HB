import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'

/**
 * Jeder Test fängt mit leerem localStorage an.
 *
 * Ohne das reicht ein Test, der sich die zuletzt gesehene Ansicht merkt, in
 * den nächsten hinein – und der scheitert dann an etwas, womit er nichts zu
 * tun hat. Gemeinsamer Zustand zwischen Tests ist die unangenehmste Sorte
 * Fehler: Er hängt an der Reihenfolge.
 */
beforeEach(() => {
  try {
    window.localStorage.clear()
    window.sessionStorage.clear()
  } catch {
    // In Umgebungen ohne Speicher gibt es nichts zu leeren.
  }
})
