import { BigLinkButton } from '@/ui/BigButton'
import { EmptyState } from '@/ui/EmptyState'
import { Screen, ScreenTitle } from '@/ui/Screen'

/**
 * Startbildschirm.
 *
 * Später steht hier ganz oben die grosse „Weiterhören“-Kachel (M5/M6). Solange
 * es keinen Katalog gibt (M3/M4), ist der leere Zustand das, was die App
 * ehrlicherweise zeigen kann.
 */
export function HomeScreen() {
  return (
    <Screen>
      <ScreenTitle>Hörbücher</ScreenTitle>
      <EmptyState
        title="Noch keine Hörbücher"
        hint="Sobald der Hörbuch-Ordner auf dem NAS verbunden ist, erscheinen hier die Bücher."
        action={<BigLinkButton to="/bibliothek">Alle Hörbücher</BigLinkButton>}
      />
    </Screen>
  )
}
