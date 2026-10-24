import { useLocation } from 'react-router-dom'

import { BigButton } from '@/ui/BigButton'
import { useInstallPrompt } from '@/lib/pwa'

/**
 * Wird nur sichtbar, wenn Android die Installation tatsächlich anbietet.
 * Ohne `beforeinstallprompt` gibt es nichts zu zeigen – dann ist die App
 * entweder schon installiert oder der Browser will nicht.
 *
 * Im Player nie: Er füllt den Bildschirm genau aus, und der Knopf darunter
 * machte ihn zur Seite, die man scrollen muss.
 */
export function InstallButton() {
  const { canInstall, install } = useInstallPrompt()
  const location = useLocation()

  if (!canInstall) return null
  if (location.pathname.startsWith('/player/')) return null

  return (
    <div className="pb-4">
      <BigButton variant="secondary" onClick={() => void install()}>
        Zum Startbildschirm hinzufügen
      </BigButton>
    </div>
  )
}
