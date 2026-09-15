/**
 * Der Einschlaf-Timer.
 *
 * Reine Rechnung, ohne Audio und ohne React – damit sich das Verhalten prüfen
 * lässt, das man sonst nur um drei Uhr nachts bemerkt.
 *
 * Gemessen wird an der **Uhr**, nicht an einem Zähler: Ein `setInterval` wird
 * von Android gedrosselt, sobald der Bildschirm ausgeht – und genau dann läuft
 * dieser Timer. Gerechnet wird deshalb gegen einen festen Zeitpunkt, und
 * nachgesehen wird bei jedem `timeupdate` des Audioelements. Das ist die eine
 * Uhr, die im Hintergrund zuverlässig weitergeht, solange etwas läuft.
 */
export type SleepMode = { kind: 'minutes'; minutes: number } | { kind: 'chapter' }

export const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60] as const

/** Über diese Zeitspanne wird am Ende sanft leiser. */
export const FADE_SECONDS = 20

/**
 * Leiser, aber nie stumm.
 *
 * Eine Lautstärke von 0 stufen Browser als „spielt nicht" ein und beenden die
 * Hintergrundwiedergabe (KONZEPT §6.1). Das Ausblenden endet deshalb hier und
 * geht dann in eine echte Pause über.
 */
export const FADE_FLOOR = 0.05

export interface SleepTimer {
  mode: SleepMode
  /** Zeitpunkt, an dem Schluss ist – `null`, solange die Uhr angehalten ist. */
  deadline: number | null
  /** Restzeit, solange die Uhr angehalten ist. */
  heldMs: number
}

export function armSleep(mode: SleepMode, now: number): SleepTimer {
  if (mode.kind === 'chapter') return { mode, deadline: null, heldMs: 0 }
  return { mode, deadline: now + mode.minutes * 60_000, heldMs: 0 }
}

/**
 * Die Uhr anhalten, solange nichts läuft.
 *
 * Wer „noch 15 Minuten hören" sagt, meint 15 Minuten **Hörzeit**. Eine Pause
 * dazwischen soll davon nichts abziehen.
 */
export function holdSleep(timer: SleepTimer, now: number): SleepTimer {
  if (timer.deadline === null) return timer
  return { ...timer, deadline: null, heldMs: Math.max(0, timer.deadline - now) }
}

export function resumeSleep(timer: SleepTimer, now: number): SleepTimer {
  if (timer.deadline !== null) return timer
  if (timer.mode.kind === 'chapter') return timer
  return { ...timer, deadline: now + timer.heldMs, heldMs: 0 }
}

/**
 * Wie lange noch?
 *
 * `chapterRemainingSec` zählt nur für „bis Kapitelende" – dort entscheidet
 * nicht die Uhr, sondern die Stelle im Buch.
 */
export function sleepRemainingSec(
  timer: SleepTimer,
  now: number,
  chapterRemainingSec: number,
): number {
  if (timer.mode.kind === 'chapter') return Math.max(0, chapterRemainingSec)
  const ms = timer.deadline === null ? timer.heldMs : timer.deadline - now
  return Math.max(0, ms / 1000)
}

/** Lautstärke für die letzten Sekunden – linear, nie unter {@link FADE_FLOOR}. */
export function fadeVolume(remainingSec: number): number {
  if (remainingSec >= FADE_SECONDS) return 1
  if (remainingSec <= 0) return FADE_FLOOR
  return FADE_FLOOR + (1 - FADE_FLOOR) * (remainingSec / FADE_SECONDS)
}

/** Beschriftung für den Knopf im Player. */
export function sleepLabel(mode: SleepMode): string {
  return mode.kind === 'chapter' ? 'Bis zum Kapitelende' : `${String(mode.minutes)} Minuten`
}
