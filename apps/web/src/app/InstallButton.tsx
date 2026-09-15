import { BigButton } from '@/ui/BigButton'
import { useInstallPrompt } from '@/lib/pwa'

/**
 * Wird nur sichtbar, wenn Android die Installation tatsächlich anbietet.
 * Ohne `beforeinstallprompt` gibt es nichts zu zeigen – dann ist die App
 * entweder schon installiert oder der Browser will nicht.
 */
export function InstallButton() {
  const { canInstall, install } = useInstallPrompt()

  if (!canInstall) return null

  return (
    <div className="pb-4">
      <BigButton variant="secondary" onClick={() => void install()}>
        Zum Startbildschirm hinzufügen
      </BigButton>
    </div>
  )
}
