import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

import { isAudioBusy } from '@/features/player/engine'
import { usePwaUpdate } from '@/lib/pwa'

import { mayReloadNow } from './reloadPolicy'

/**
 * Übernimmt eine neue Version von selbst – an einer Stelle, an der es niemand
 * merkt.
 *
 * Früher meldete sich unten eine Leiste „Neue Version da · Aktualisieren".
 * Für die Kinder war das ein Knopf, der plötzlich auftauchte und zu nichts
 * gehörte. Jetzt gibt es keinen Knopf mehr, sondern zwei Gelegenheiten:
 *
 * - **Gleich beim Start.** Der Browser sieht beim Öffnen der App nach, ob es
 *   eine neue Version gibt, und meldet sie nach wenigen Sekunden. Ist dann
 *   noch nichts los, lädt die App einmal neu – man sieht ein kurzes Flackern.
 * - **Beim Wechsel in den Hintergrund und zurück.** War beim Start schon ein
 *   Hörbuch an, wartet die neue Version. Wird die App weggelegt und nichts
 *   spielt, lädt sie dort neu, wo es keiner sieht.
 *
 * Bewusst nicht bei jedem Bildschirmwechsel: Wer gerade den Player verlässt,
 * soll nicht zusehen, wie die App unter ihm neu startet.
 */
export function AutoUpdate() {
  const { needRefresh, update } = usePwaUpdate()
  const { pathname } = useLocation()

  // Als Ref, nicht als Abhängigkeit: Ein Wechsel des Bildschirms soll das
  // Neuladen nicht auslösen, nur erlauben oder verbieten.
  const imPlayer = useRef(false)
  useEffect(() => {
    imPlayer.current = pathname.startsWith('/player/')
  }, [pathname])

  useEffect(() => {
    if (!needRefresh) return

    const versuchen = (): void => {
      if (mayReloadNow({ busy: isAudioBusy(), inPlayer: imPlayer.current })) update()
    }

    versuchen()
    document.addEventListener('visibilitychange', versuchen)
    return () => {
      document.removeEventListener('visibilitychange', versuchen)
    }
  }, [needRefresh, update])

  return null
}
