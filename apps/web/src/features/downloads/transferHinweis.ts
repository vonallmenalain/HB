import { type TransferMode } from './downloadsContext'

/**
 * Die eine Frage, die sich beim Herunterladen stellt: Kann ich das Tablet
 * weglegen?
 *
 * Läuft gerade etwas, zählt was tatsächlich passiert – nicht, was das Gerät
 * könnte. Ein Gerät mit Background Fetch kann eine einzelne Übergabe durchaus
 * ablehnen; dann lädt die App im Vordergrund, und Schliessen bricht ab.
 */
export function transferHinweis(transfer: TransferMode | null, background: boolean): string {
  if (transfer === 'foreground') {
    return 'Dieser Download läuft nur, solange die App offen ist. Lass sie bitte offen.'
  }
  if (transfer === 'background') {
    return 'Das Gerät lädt im Hintergrund weiter – die App darf dabei zu sein.'
  }
  return background
    ? 'Dieses Gerät kann Downloads dem Betriebssystem übergeben. Dann läuft ein Download weiter, auch wenn die App zu ist.'
    : 'Dieses Gerät lädt nur, solange die App offen ist.'
}
