import { BigLinkButton } from '@/ui/BigButton'
import { EmptyState } from '@/ui/EmptyState'
import { Screen, ScreenTitle } from '@/ui/Screen'

export function LibraryScreen() {
  return (
    <Screen>
      <ScreenTitle>Alle Hörbücher</ScreenTitle>
      <EmptyState
        title="Die Bibliothek ist leer"
        hint="Hier kommt das Raster mit den Covern hin."
        action={
          <BigLinkButton to="/" variant="secondary">
            Zurück
          </BigLinkButton>
        }
      />
    </Screen>
  )
}
