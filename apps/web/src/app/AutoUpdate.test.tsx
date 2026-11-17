import { act, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AutoUpdate } from './AutoUpdate'
import { mayReloadNow } from './reloadPolicy'

const pwa = vi.hoisted(() => ({ needRefresh: true, update: vi.fn() }))
const audio = vi.hoisted(() => ({ busy: false }))

vi.mock('@/lib/pwa', () => ({
  usePwaUpdate: () => ({ needRefresh: pwa.needRefresh, offlineReady: false, update: pwa.update }),
}))
vi.mock('@/features/player/engine', () => ({
  isAudioBusy: () => audio.busy,
}))

function zeigen(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AutoUpdate />
    </MemoryRouter>,
  )
}

/** Die App geht in den Hintergrund oder kommt zurück. */
function sichtbarkeitWechselt(): void {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

beforeEach(() => {
  pwa.needRefresh = true
  pwa.update.mockReset()
  audio.busy = false
})

describe('mayReloadNow', () => {
  it('lädt nur, wenn nichts läuft und der Player zu ist', () => {
    expect(mayReloadNow({ busy: false, inPlayer: false })).toBe(true)
    expect(mayReloadNow({ busy: true, inPlayer: false })).toBe(false)
    expect(mayReloadNow({ busy: false, inPlayer: true })).toBe(false)
  })
})

describe('Neue Version', () => {
  it('wird beim Start gleich übernommen, ohne Knopf', () => {
    // Genau das störte: eine Leiste „Aktualisieren", die plötzlich auftauchte.
    const { container } = zeigen('/bibliothek')

    expect(pwa.update).toHaveBeenCalledOnce()
    expect(container).toBeEmptyDOMElement()
  })

  it('tut nichts, solange keine da ist', () => {
    pwa.needRefresh = false
    zeigen('/')
    sichtbarkeitWechselt()

    expect(pwa.update).not.toHaveBeenCalled()
  })

  it('wartet, solange ein Hörbuch läuft – und kommt beim Weglegen', () => {
    audio.busy = true
    zeigen('/bibliothek')
    expect(pwa.update).not.toHaveBeenCalled()

    // Weiter in den Hintergrund, während es noch läuft: wieder nichts.
    sichtbarkeitWechselt()
    expect(pwa.update).not.toHaveBeenCalled()

    // Angehalten und weggelegt: Jetzt sieht es keiner.
    audio.busy = false
    sichtbarkeitWechselt()
    expect(pwa.update).toHaveBeenCalledOnce()
  })

  it('lädt im Player nicht neu, auch wenn er angehalten ist', () => {
    zeigen('/player/b_1')
    sichtbarkeitWechselt()

    expect(pwa.update).not.toHaveBeenCalled()
  })
})
