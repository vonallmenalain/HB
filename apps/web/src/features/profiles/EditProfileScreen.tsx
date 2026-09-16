import { Link, Navigate, useNavigate } from 'react-router-dom'

import { useAuth } from '@/features/auth/authContext'
import { useParents } from '@/features/parents/parentsContext'
import { Avatar } from '@/ui/Avatar'
import { BigButton, BigLinkButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'
import { Screen, ScreenTitle } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'

import { AVATARS, COLORS } from './profile'
import { useProfiles } from './profilesContext'

/**
 * Das eigene Bild ändern – und der sichtbare Weg zu allem anderen.
 *
 * Tier und Farbe gehören dem Kind: Es darf sie jederzeit wechseln. Darunter
 * liegt die Tür für die Erwachsenen. Der Elternbereich war bis M9 nur über
 * zwei Sekunden Druck auf den Titel zu erreichen – ein Eingang, den niemand
 * findet, der ihn nicht kennt. Jetzt steht er hier, hinter der PIN.
 *
 * Bewusst klein und grau: Für ein Kind ist das keine Wahl, die es hat, sondern
 * eine Tür, die es nicht aufbekommt. Als grosser Knopf lud sie zum Antippen
 * ein und verstellte den Weg zurück zu den Hörbüchern. Und „Anderes Kind"
 * steht nur da, wenn dieses Profil wechseln darf – sonst wäre der Knopf ein
 * Versprechen, das die Weiche gleich danach bricht.
 */
export function EditProfileScreen() {
  const { loading, selected, update, clearSelection } = useProfiles()
  const { hasPin } = useParents()
  const { isAdmin } = useAuth()
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
      <ScreenTitle>Dein Profil</ScreenTitle>

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
        {selected.maySwitchProfile ? (
          <BigButton
            variant="secondary"
            onClick={() => {
              clearSelection()
              void navigate('/profil')
            }}
          >
            Anderes Kind
          </BigButton>
        ) : null}
      </div>

      <section className="flex flex-col gap-3 pt-10">
        {hasPin ? null : (
          <Notice>
            Noch keine PIN gesetzt – der Elternbereich steht damit jedem offen,
            auch den Kindern. Im Elternbereich lässt sich das in einer Minute ändern.
          </Notice>
        )}

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/eltern"
            className="min-h-touch rounded-tile px-2 py-3 text-ink-soft underline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {hasPin ? '🔒 Für Erwachsene' : 'Für Erwachsene'}
          </Link>

          {isAdmin ? (
            <Link
              to="/admin"
              className="min-h-touch rounded-tile px-2 py-3 text-ink-soft underline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {hasPin ? '🔒 Adminbereich' : 'Adminbereich'}
            </Link>
          ) : null}
        </div>
      </section>
    </Screen>
  )
}
