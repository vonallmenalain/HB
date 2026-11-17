import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Registrierung des Service Workers und der Aktualisierungs-Ablauf.
 *
 * Hier wird nur gemeldet, dass eine neue Version wartet. *Wann* sie übernommen
 * wird, entscheidet `AutoUpdate` – nie mitten im Kapitel, denn ein Neuladen
 * dort kostete genau das, worum es in dieser App geht.
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

/** So oft sieht die App beim Zurückholen höchstens nach einer neuen Version. */
export const UPDATE_CHECK_MS = 30 * 60 * 1000

/**
 * Sieht nach einer neuen Version, sobald die App wieder in den Vordergrund
 * kommt.
 *
 * Von selbst prüft der Browser nur, wenn die Seite wirklich geladen wird. Auf
 * Android bleibt die App aber oft tagelang im Speicher und wird nur
 * hervorgeholt – ohne diesen Blick käme eine neue Version erst an, wenn das
 * System sie einmal ganz beendet. Höchstens alle halbe Stunde: Ein Tablet wird
 * am Tag dutzendmal geweckt.
 */
export function watchForUpdates(
  check: () => Promise<unknown>,
  now: () => number = Date.now,
): () => void {
  let zuletzt = now()
  const onVisible = (): void => {
    if (document.visibilityState !== 'visible') return
    if (now() - zuletzt < UPDATE_CHECK_MS) return
    zuletzt = now()
    // Offline schlägt das fehl – dann eben beim nächsten Mal.
    void check().catch(() => undefined)
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
  }
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
    onRegisteredSW: (_url, registration) => {
      if (registration) watchForUpdates(() => registration.update())
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

/**
 * Läuft die App als installierte PWA (und nicht im Browser-Tab)?
 *
 * Beide Modi zählen: Installiert läuft sie im Vollbild, aber ein Browser, der
 * das nicht hergibt, fällt auf `standalone` zurück – und dann wäre sie trotzdem
 * installiert.
 */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}
