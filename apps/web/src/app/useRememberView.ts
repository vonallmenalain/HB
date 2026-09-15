import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { lastView, rememberView } from './lastView'

/**
 * Merkt sich die Ansicht und stellt sie beim nächsten Start wieder her.
 *
 * Wiederhergestellt wird genau einmal, und nur aus dem Startbildschirm heraus:
 * Wer die App über einen Link oder den Sperrbildschirm irgendwo anders öffnet,
 * soll dort landen und nicht dort, wo er gestern aufgehört hat.
 */
export function useRememberView(): void {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const wiederhergestellt = useRef(false)

  useEffect(() => {
    if (wiederhergestellt.current) return
    wiederhergestellt.current = true
    if (pathname !== '/') return

    const gemerkt = lastView()
    if (gemerkt !== null) void navigate(gemerkt, { replace: true })
    // Absichtlich nur beim ersten Lauf – deshalb keine Abhängigkeiten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    rememberView(pathname)
  }, [pathname])
}
