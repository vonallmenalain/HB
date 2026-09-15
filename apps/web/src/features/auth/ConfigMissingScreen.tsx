import { Notice } from '@/ui/Notice'
import { Screen, ScreenTitle } from '@/ui/Screen'

/**
 * Die App wurde ohne Firebase-Konfiguration gebaut. Statt eines kryptischen
 * Firebase-Fehlers steht hier, welche Variablen fehlen.
 */
export function ConfigMissingScreen({ missing }: { missing: string[] }) {
  return (
    <Screen>
      <ScreenTitle>Konfiguration fehlt</ScreenTitle>
      <div className="flex flex-col gap-4">
        <Notice tone="error">
          Diese Variablen fehlen im Build. In Netlify unter <em>Site settings → Environment
          variables</em> setzen, lokal in <code className="font-mono">.env.local</code>.
        </Notice>
        <ul className="flex flex-col gap-2">
          {missing.map((name) => (
            <li
              key={name}
              className="rounded-tile border-2 border-line bg-surface-sunken px-4 py-3 font-mono text-sm break-all"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  )
}
