import { useNavigate } from 'react-router-dom'

import { useLongPress } from './useLongPress'

/**
 * Der Eingang zum Elternbereich: zwei Sekunden auf den Titel drücken.
 *
 * Kein sichtbarer Knopf – sonst tippt ihn früher oder später jedes Kind an.
 *
 * Die Überschrift bleibt dabei eine Überschrift. Sie zu einem Knopf zu machen
 * wäre der naheliegende Weg und der falsche: Die Seite verlöre ihre
 * Hauptüberschrift, und wer die App vorgelesen bekommt, fände sich nicht mehr
 * zurecht. Für Tastatur und Vorleseprogramm steht deshalb daneben ein eigener
 * Knopf, den nur sie zu sehen bekommen.
 */
export function ParentEntry({ children }: { children: string }) {
  const navigate = useNavigate()
  const oeffnen = (): void => {
    void navigate('/eltern')
  }
  const { aktiv, handlers } = useLongPress(oeffnen)

  return (
    <div className="flex flex-1 items-center">
      <h1
        {...handlers}
        className={`select-none text-3xl font-bold tracking-tight transition-opacity duration-200 ${
          aktiv ? 'opacity-60' : ''
        }`}
      >
        {children}
      </h1>

      <button
        type="button"
        onClick={oeffnen}
        className="sr-only focus-visible:not-sr-only focus-visible:ml-3 focus-visible:min-h-touch focus-visible:rounded-tile focus-visible:px-3 focus-visible:underline"
      >
        Elternbereich öffnen
      </button>
    </div>
  )
}
