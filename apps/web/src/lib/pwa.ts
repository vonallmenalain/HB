import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Registrierung des Service Workers und der Aktualisierungs-Ablauf.
 *
 * Bewusst *kein* automatischer Reload: Sobald der Player steht (M5), würde ein
 * Neuladen mitten im Kapitel genau den Fortschritt kosten, um den es in dieser
 * App geht. Stattdessen meldet sich eine Leiste, und die Aktualisierung
 * passiert erst auf Tastendruck.
 */
interface PwaState {
  needRefresh: boolean
  offlineReady: boolean
}

export interface PwaUpdate extends PwaState {
  update: () => void
}

let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | undefined

// Kleiner externer Store: Der Service Worker meldet sich ausserhalb von React,
// deshalb `useSyncExternalStore` statt eines Effekts mit setState.
const listeners = new Set<() => void>()
let snapshot: PwaState = { needRefresh: false, offlineReady: false }

function publish(next: Partial<PwaState>): void {
  snapshot = { ...snapshot, ...next }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): PwaState {
  return snapshot
}

export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return

  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh: () => {
      publish({ needRefresh: true })
    },
    onOfflineReady: () => {
      publish({ offlineReady: true })
    },
  })
}

export function usePwaUpdate(): PwaUpdate {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const update = useCallback(() => {
    publish({ needRefresh: false })
    void applyUpdate?.()
  }, [])

  return { ...state, update }
}

/**
 * Android feuert `beforeinstallprompt`, bevor es einen eigenen Installations-
 * Hinweis zeigt. Wir fangen das Ereignis ab und bieten die Installation an der
 * Stelle an, an der sie Sinn ergibt.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallPrompt {
  canInstall: boolean
  install: () => Promise<void>
}

export function useInstallPrompt(): InstallPrompt {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (event: Event): void => {
      event.preventDefault()
      setDeferred(event as InstallPromptEvent)
    }
    const onInstalled = (): void => {
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
  }, [deferred])

  return { canInstall: deferred !== null, install }
}

/** Läuft die App als installierte PWA (und nicht im Browser-Tab)? */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
}
