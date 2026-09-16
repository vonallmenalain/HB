import { Link, useNavigate } from 'react-router-dom'

import { Avatar } from '@/ui/Avatar'
import { BigLinkButton } from '@/ui/BigButton'
import { EmptyState } from '@/ui/EmptyState'
import { Screen, ScreenTitle } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'

import { useProfiles } from './profilesContext'

/**
 * Profilauswahl – der einzige Bildschirm vor dem Hören.
 *
 * Bewusst ohne Text ausser dem Namen: Ein Kind tippt sein Bild an, mehr nicht.
 *
 * Danach ist dieser Bildschirm für das Kind verschwunden, solange sein Profil
 * nicht wechseln darf – wer ihn wieder braucht, geht durch den Elternbereich
 * (siehe `ProfileGate` in `AppRoutes`).
 */
export function ProfilePicker() {
  const { loading, profiles, select } = useProfiles()
  const navigate = useNavigate()

  if (loading) {
    return (
      <Screen>
        <Spinner label="Profile werden geladen" />
      </Screen>
    )
  }

  if (profiles.length === 0) {
    return (
      <Screen>
        <ScreenTitle>Wer hört zu?</ScreenTitle>
        <EmptyState
          title="Noch kein Profil"
          hint="Lege für jedes Kind ein Profil an. Jedes merkt sich seinen eigenen Fortschritt."
          action={<BigLinkButton to="/eltern">Profil anlegen</BigLinkButton>}
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenTitle>Wer hört zu?</ScreenTitle>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {profiles.map((profile) => (
          <li key={profile.id}>
            <button
              type="button"
              onClick={() => {
                select(profile.id)
                // `/profil` zeigt immer die Auswahl – ohne diesen Schritt
                // bliebe das Kind nach dem Antippen auf dieser Seite stehen.
                void navigate('/')
              }}
              className="flex w-full flex-col items-center gap-3 rounded-tile bg-surface p-4 transition-transform active:scale-[0.97] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Avatar avatar={profile.avatar} color={profile.color} />
              <span className="text-xl font-semibold">{profile.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex-1" />

      <Link
        to="/eltern"
        className="mt-6 flex min-h-touch items-center justify-center rounded-tile text-ink-soft underline"
      >
        Profile verwalten
      </Link>
    </Screen>
  )
}
