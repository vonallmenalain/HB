import { readLocal, writeLocal } from '@/lib/localStore'

const KEY = 'hb.view'

/**
 * Die zuletzt gesehene Ansicht, damit sie den App-Neustart überlebt
 * (KONZEPT §5.5).
 *
 * Gemerkt wird nur, wo geblättert wurde – nie der Player. Ihn beim Öffnen
 * wiederherzustellen hiesse, dass die App von selbst zu spielen anfängt,
 * sobald jemand sie antippt. Wer weiterhören will, findet die Kachel
 * „Weiterhören" ganz oben; wer nur nachsehen wollte, bekommt keinen Ton ins
 * Wohnzimmer.
 */
const ERLAUBT = [
  /^\/$/,
  /^\/bibliothek$/,
  // Auch die Reihe, in der geblättert wurde – sonst landet man nach dem
  // Neustart wieder in der Übersicht und sucht sie erneut.
  /^\/bibliothek\/[^/]+$/,
  /^\/buch\/[^/]+$/,
]

/** Aus dem Player wird die Buchseite – dieselbe Stelle, ohne Wiedergabe. */
const PLAYER = /^\/player\/([^/]+)$/

export function rememberView(pfad: string): void {
  const spielt = PLAYER.exec(pfad)
  const merken = spielt ? `/buch/${spielt[1] ?? ''}` : pfad
  if (!ERLAUBT.some((muster) => muster.test(merken))) return
  writeLocal(KEY, merken)
}

export function lastView(): string | null {
  const gemerkt = readLocal(KEY)
  if (gemerkt === null || !ERLAUBT.some((muster) => muster.test(gemerkt))) return null
  return gemerkt === '/' ? null : gemerkt
}
