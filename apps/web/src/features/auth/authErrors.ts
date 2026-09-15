/**
 * Übersetzt Firebase-Fehlercodes in Sätze, die im Elternbereich weiterhelfen.
 *
 * Firebase liefert Meldungen wie „Firebase: Error (auth/invalid-credential).“ –
 * das hilft niemandem. Unbekannte Codes werden mitgeliefert, damit sich ein
 * Problem überhaupt melden lässt.
 */
const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Diese E-Mail-Adresse sieht nicht richtig aus.',
  'auth/missing-password': 'Bitte gib ein Passwort ein.',
  'auth/invalid-credential': 'E-Mail-Adresse oder Passwort stimmen nicht.',
  'auth/wrong-password': 'E-Mail-Adresse oder Passwort stimmen nicht.',
  'auth/user-not-found': 'Zu dieser E-Mail-Adresse gibt es kein Konto.',
  'auth/user-disabled': 'Dieses Konto wurde gesperrt.',
  'auth/too-many-requests':
    'Zu viele Versuche. Bitte warte einen Moment und probier es dann nochmal.',
  'auth/network-request-failed': 'Keine Verbindung. Ist das Gerät online?',
  'auth/popup-closed-by-user': 'Das Anmeldefenster wurde geschlossen.',
  'auth/popup-blocked': 'Der Browser hat das Anmeldefenster blockiert.',
  'auth/cancelled-popup-request': 'Die Anmeldung wurde abgebrochen.',
  'auth/operation-not-allowed':
    'Diese Anmeldeart ist im Firebase-Projekt nicht aktiviert.',
  'auth/admin-restricted-operation':
    'Neue Konten sind gesperrt. Das Konto muss in der Firebase-Konsole angelegt werden.',
  'auth/unauthorized-domain':
    'Diese Adresse ist in Firebase nicht als autorisierte Domain eingetragen.',
  'auth/invalid-action-code':
    'Dieser Anmeldelink ist abgelaufen oder wurde schon benutzt.',
  'auth/account-exists-with-different-credential':
    'Zu dieser E-Mail-Adresse gibt es bereits ein Konto mit einer anderen Anmeldeart.',
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

export function authErrorMessage(error: unknown): string {
  const code = errorCodeOf(error)
  if (code === undefined) return 'Unbekannter Fehler bei der Anmeldung.'

  const message = MESSAGES[code]
  if (message !== undefined) return message

  return `Anmeldung fehlgeschlagen (${code}).`
}
