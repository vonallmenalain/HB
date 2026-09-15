import { BigButton } from '@/ui/BigButton'
import { usePwaUpdate } from '@/lib/pwa'

/**
 * Meldet eine neue Version, statt selbsttätig neu zu laden. Ab M5 bekommt diese
 * Leiste zusätzlich die Bedingung, dass gerade nichts abgespielt wird.
 */
export function UpdateBar() {
  const { needRefresh, update } = usePwaUpdate()

  if (!needRefresh) return null

  return (
    <div className="sticky bottom-0 z-10 px-4 pb-2">
      <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-tile bg-surface p-3 shadow-lg ring-2 ring-line">
        <p className="flex-1 pl-2 font-semibold">Neue Version da</p>
        <BigButton className="w-auto shrink-0" onClick={update}>
          Aktualisieren
        </BigButton>
      </div>
    </div>
  )
}
