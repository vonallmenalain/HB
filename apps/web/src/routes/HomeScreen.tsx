import { Link } from 'react-router-dom'

import { useProfiles } from '@/features/profiles/profilesContext'
import { Avatar } from '@/ui/Avatar'
import { BigLinkButton } from '@/ui/BigButton'
import { EmptyState } from '@/ui/EmptyState'
import { Screen } from '@/ui/Screen'

/**
 * Startbildschirm.
 *
 * Später steht hier ganz oben die grosse „Weiterhören“-Kachel (M5/M6). Solange
 * es keinen Katalog gibt (M3/M4), ist der leere Zustand das, was die App
 * ehrlicherweise zeigen kann.
 */
export function HomeScreen() {
  const { selected } = useProfiles()

  return (
    <Screen>
      <div className="flex items-center gap-4 py-6">
        <h1 className="flex-1 text-3xl font-bold tracking-tight">Hörbücher</h1>
        {selected ? (
          <Link
            to="/profil"
            aria-label={`Angemeldet als ${selected.name}. Profil wechseln.`}
            className="flex items-center gap-3 rounded-full focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Avatar avatar={selected.avatar} color={selected.color} size="sm" />
          </Link>
        ) : null}
      </div>

      <EmptyState
        title="Noch keine Hörbücher"
        hint="Sobald der Hörbuch-Ordner auf dem NAS verbunden ist, erscheinen hier die Bücher."
        action={<BigLinkButton to="/bibliothek">Alle Hörbücher</BigLinkButton>}
      />
    </Screen>
  )
}
