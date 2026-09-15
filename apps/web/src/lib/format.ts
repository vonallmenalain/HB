/**
 * Zeitformatierung für Player und Bibliothek.
 *
 * Alle Funktionen sind gegen die Realität abgesichert: `NaN` kommt aus einem
 * `<audio>`-Element, bevor Metadaten geladen sind, und negative Werte entstehen
 * beim Zurückspringen über den Anfang hinaus.
 */

function toSafeSeconds(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

/** `754` → `"12:34"`, `3754` → `"1:02:34"` */
export function formatTime(seconds: number): string {
  const total = toSafeSeconds(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  const ss = String(secs).padStart(2, '0')

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Restzeit als Vorzeichen-Angabe fürs Player-Display: `"-18:22"` */
export function formatCountdown(remainingSeconds: number): string {
  return `-${formatTime(remainingSeconds)}`
}

/**
 * Restzeit in Worten, für Kinder lesbar: `"noch 18 Min"`, `"noch 1 Std 5 Min"`.
 * Unter einer Minute wird nicht auf Sekunden heruntergezählt – das erzeugt nur
 * Hektik.
 */
export function formatRemaining(seconds: number): string {
  const total = toSafeSeconds(seconds)
  if (total < 60) return 'gleich fertig'

  const hours = Math.floor(total / 3600)
  const minutes = Math.round((total % 3600) / 60)

  if (hours === 0) return `noch ${minutes} Min`
  if (minutes === 0) return `noch ${hours} Std`
  return `noch ${hours} Std ${minutes} Min`
}

/**
 * Anteil eines Hörbuchs, das bereits gehört wurde – als Wert zwischen 0 und 1.
 * Ab 97 % gilt ein Buch laut Konzept als beendet; diese Schwelle liegt hier,
 * damit Bibliothek und Player dieselbe Rechnung benutzen.
 */
export const FINISHED_THRESHOLD = 0.97

export function progressRatio(positionSec: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0
  const ratio = toSafeSeconds(positionSec) / durationSec
  return Math.min(1, Math.max(0, ratio))
}

export function isFinished(positionSec: number, durationSec: number): boolean {
  return progressRatio(positionSec, durationSec) >= FINISHED_THRESHOLD
}
