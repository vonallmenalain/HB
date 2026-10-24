import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import { afterEach, describe, expect, it } from 'vitest'

import { preventPinchZoom } from './noZoom'

/**
 * Zoomen ist gesperrt – auf drei Wegen, weil jeder Browser auf einen anderen
 * hört. Fehlt einer, merkt man es erst auf dem Gerät, das gerade auf ihn hört.
 */
describe('Zoom-Sperre', () => {
  let aufheben: (() => void) | null = null

  afterEach(() => {
    aufheben?.()
    aufheben = null
  })

  it('fängt die Zoom-Geste von Safari ab', () => {
    aufheben = preventPinchZoom()

    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
      const event = new Event(name, { cancelable: true })
      document.dispatchEvent(event)
      expect(event.defaultPrevented, name).toBe(true)
    }
  })

  it('lässt andere Ereignisse in Ruhe und lässt sich wieder aufheben', () => {
    aufheben = preventPinchZoom()
    const tipp = new Event('touchstart', { cancelable: true })
    document.dispatchEvent(tipp)
    expect(tipp.defaultPrevented).toBe(false)

    aufheben()
    aufheben = null
    const geste = new Event('gesturestart', { cancelable: true })
    document.dispatchEvent(geste)
    expect(geste.defaultPrevented).toBe(false)
  })

  it('steht im Viewport von index.html', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
    const viewport = /<meta\s+name="viewport"\s+content="([^"]*)"/.exec(html)?.[1] ?? ''
    expect(viewport).toContain('user-scalable=no')
    expect(viewport).toContain('maximum-scale=1')
    // Die sicheren Bereiche brauchen das weiterhin.
    expect(viewport).toContain('viewport-fit=cover')
  })

  it('steht in index.css für alle Elemente', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8')
    expect(css).toMatch(/html\s*\{[^}]*touch-action:\s*pan-x pan-y/)
  })
})
