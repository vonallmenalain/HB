import { Navigate, useNavigate } from 'react-router-dom'

import { Avatar } from '@/ui/Avatar'
import { BigButton, BigLinkButton } from '@/ui/BigButton'
import { Screen, ScreenTitle } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'

import { AVATARS, COLORS } from './profile'
import { useProfiles } from './profilesContext'

/**
 * Das eigene Bild ändern – ohne Eltern-PIN.
 *
 * Tier und Farbe gehören dem Kind: Es darf sie jederzeit wechseln, und mehr
 * kann es hier nicht. Der Name bleibt im Elternbereich, sonst heisst am
 * Nachmittag jemand „aaaaaa".
 */
export function EditProfileScreen() {
  const { loading, selected, update, clearSelection } = useProfiles()
  const navigate = useNavigate()

  if (loading) {
    return (
      <Screen>
        <Spinner label="Einen Moment" />
      </Screen>
    )
  }

  if (!selected) return <Navigate to="/profil" replace />

  return (
    <Screen>
      <ScreenTitle>Dein Bild</ScreenTitle>

      <div className="flex flex-col items-center gap-3 pb-6">
        <Avatar avatar={selected.avatar} color={selected.color} size="lg" />
        <p className="text-2xl font-bold">{selected.name}</p>
      </div>

      <fieldset className="flex flex-col gap-2 pb-6">
        <legend className="pb-2 pl-1 font-semibold text-ink-soft">Dein Tier</legend>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={selected.avatar === option}
              aria-label={`Bild ${option}`}
              onClick={() => {
                void update(selected.id, { avatar: option })
              }}
              className={`size-touch rounded-full text-3xl ${
                selected.avatar === option ? 'ring-4 ring-primary' : 'bg-surface'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2 pb-8">
        <legend className="pb-2 pl-1 font-semibold text-ink-soft">Deine Farbe</legend>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={selected.color === option}
              aria-label={`Farbe ${option}`}
              style={{ backgroundColor: option }}
              onClick={() => {
                void update(selected.id, { color: option })
              }}
              className={`size-touch rounded-full ${
                selected.color === option ? 'ring-4 ring-ink' : ''
              }`}
            />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        <BigLinkButton to="/">Fertig</BigLinkButton>
        <BigButton
          variant="secondary"
          onClick={() => {
            clearSelection()
            void navigate('/profil')
          }}
        >
          Anderes Kind
        </BigButton>
      </div>
    </Screen>
  )
}
