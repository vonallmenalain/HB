/**
 * Typen für die Background Fetch API.
 *
 * TypeScript kennt sie nicht – sie steht in keiner der mitgelieferten
 * Bibliotheken. Deklariert ist hier nur, was tatsächlich benutzt wird; alles
 * andere wegzulassen ist ehrlicher, als eine vollständige Fassung
 * vorzutäuschen.
 *
 * Reine Typen, kein Code: Die Datei verschwindet beim Übersetzen.
 */
export interface BackgroundFetchRecord {
  readonly request: Request
  readonly responseReady: Promise<Response>
}

export interface BackgroundFetchRegistration extends EventTarget {
  readonly id: string
  readonly downloaded: number
  readonly downloadTotal: number
  readonly result: '' | 'success' | 'failure'
  readonly failureReason: string
  readonly recordsAvailable: boolean
  matchAll: () => Promise<BackgroundFetchRecord[]>
  abort: () => Promise<boolean>
}

export interface BackgroundFetchOptions {
  title?: string
  icons?: { src: string; sizes?: string; type?: string }[]
  downloadTotal?: number
}

export interface BackgroundFetchManager {
  fetch: (
    id: string,
    requests: readonly (Request | string)[],
    options?: BackgroundFetchOptions,
  ) => Promise<BackgroundFetchRegistration>
  get: (id: string) => Promise<BackgroundFetchRegistration | undefined>
  getIds: () => Promise<string[]>
}

declare global {
  interface ServiceWorkerRegistration {
    readonly backgroundFetch?: BackgroundFetchManager
  }
}
