/**
 * localStorage, das nie wirft.
 *
 * Im privaten Modus, bei blockierten Website-Daten und in
 * Vorschau-Umgebungen kann jeder Zugriff eine Ausnahme auslösen. Nichts
 * hiervon darf die App anhalten – es geht ausschliesslich um Bequemlichkeiten
 * wie „welches Profil war zuletzt aktiv“.
 */
export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // bewusst ignoriert
  }
}

export function removeLocal(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // bewusst ignoriert
  }
}
