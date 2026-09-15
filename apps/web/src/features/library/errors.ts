import { type MediaError } from './mediaClient'

/**
 * Fehler des Medien-Dienstes in Sätze, die im Elternbereich weiterhelfen.
 * Im Kinderbereich wird stattdessen schlicht der zuletzt bekannte Stand
 * gezeigt – ein Kind kann mit „403" nichts anfangen.
 */
export function libraryErrorMessage(error: MediaError): string {
  switch (error) {
    case 'not-configured':
      return 'VITE_MEDIA_BASE_URL ist nicht gesetzt – der Medien-Dienst ist unbekannt.'
    case 'offline':
      return 'Das NAS ist gerade nicht erreichbar.'
    case 'not-signed-in':
      return 'Du bist nicht angemeldet.'
    case 'forbidden':
      return 'Dieses Konto ist auf dem NAS nicht freigeschaltet (HB_ALLOWED_UIDS).'
    case 'unauthorized':
      return 'Der Zugang zum NAS wurde abgelehnt.'
    case 'unsupported-version':
      return 'Der Medien-Dienst ist neuer als die App. Bitte die App aktualisieren.'
    case 'malformed':
      return 'Der Medien-Dienst hat unverständlich geantwortet.'
    case 'server':
      return 'Der Medien-Dienst meldet einen Fehler.'
  }
}
