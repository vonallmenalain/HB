import { afterEach, describe, expect, it, vi } from 'vitest'

import { UPDATE_CHECK_MS, watchForUpdates } from './pwa'

function sichtbar(zustand: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: zustand })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('watchForUpdates', () => {
  let aufhoeren: (() => void) | undefined

  afterEach(() => {
    aufhoeren?.()
    sichtbar('visible')
  })

  it('sieht beim Zurückholen nach – aber höchstens alle halbe Stunde', () => {
    let uhr = 0
    const check = vi.fn().mockResolvedValue(undefined)
    aufhoeren = watchForUpdates(check, () => uhr)

    // Kurz weg und gleich wieder da: Der Start hat eben erst nachgesehen.
    uhr = 60_000
    sichtbar('visible')
    expect(check).not.toHaveBeenCalled()

    uhr = UPDATE_CHECK_MS + 1
    sichtbar('visible')
    expect(check).toHaveBeenCalledOnce()

    // Direkt danach noch einmal: wieder zu früh.
    uhr += 1000
    sichtbar('visible')
    expect(check).toHaveBeenCalledOnce()
  })

  it('schaut nicht nach, wenn die App gerade weggelegt wird', () => {
    let uhr = 0
    const check = vi.fn().mockResolvedValue(undefined)
    aufhoeren = watchForUpdates(check, () => uhr)

    uhr = UPDATE_CHECK_MS * 2
    sichtbar('hidden')
    expect(check).not.toHaveBeenCalled()
  })

  it('übersteht es, offline zu sein', async () => {
    let uhr = 0
    const check = vi.fn().mockRejectedValue(new Error('offline'))
    aufhoeren = watchForUpdates(check, () => uhr)

    uhr = UPDATE_CHECK_MS + 1
    sichtbar('visible')
    await Promise.resolve()
    expect(check).toHaveBeenCalledOnce()
  })
})
