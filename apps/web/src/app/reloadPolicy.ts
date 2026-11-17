/**
 * Darf die App jetzt neu laden, ohne jemanden zu stören?
 *
 * Nicht, solange Ton läuft oder gleich kommt: Ein Neuladen mitten im Kapitel
 * reisst die Geschichte ab. Und nicht im Player, auch wenn er gerade angehalten
 * ist – dort sitzt ein Kind vor dem Play-Knopf, und der verschwände ihm unter
 * dem Finger.
 */
export function mayReloadNow({ busy, inPlayer }: { busy: boolean; inPlayer: boolean }): boolean {
  return !busy && !inPlayer
}
