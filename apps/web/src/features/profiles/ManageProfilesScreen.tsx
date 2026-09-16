import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '@/features/auth/authContext'
import { DownloadsSection } from '@/features/downloads/DownloadsSection'
import { LibrarySection } from '@/features/parents/LibrarySection'
import { PinSection } from '@/features/parents/PinSection'
import { ResetSection } from '@/features/parents/ResetSection'
import { SyncNotice } from '@/features/progress/SyncNotice'
import { Avatar } from '@/ui/Avatar'
import { BigButton, BigLinkButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'
import { Screen, ScreenTitle } from '@/ui/Screen'
import { TextField } from '@/ui/TextField'

import { ProfileCard } from './ProfileCard'
import { AVATARS, COLORS, checkProfileName } from './profile'
import { useProfiles } from './profilesContext'

/**
 * Elternbereich: Profile anlegen, festlegen, was jedes Kind darf, abmelden.
 *
 * Liegt hinter der PIN. Was hier eingestellt wird, wirkt sofort auf allen
 * Geräten – Alter, gesperrte Hörbücher und der Profilwechsel hängen am Profil
 * und nicht am Gerät.
 */
export function ManageProfilesScreen() {
  const { profiles, selected, create, clearSelection } = useProfiles()
  const { state, actions, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string>(AVATARS[0])
  const [color, setColor] = useState<string>(COLORS[0])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function onSubmit(event: FormEvent): void {
    event.preventDefault()
    const check = checkProfileName(
      name,
      profiles.map((profile) => profile.name),
    )
    if (!check.ok) {
      setError(check.reason ?? 'Der Name geht so nicht.')
      return
    }

    setBusy(true)
    setError(null)
    void create({ name, avatar, color })
      .then(() => {
        setName('')
        setAvatar(AVATARS[0])
        setColor(COLORS[0])
      })
      .catch(() => {
        setError('Das Profil konnte nicht gespeichert werden.')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <Screen>
      <ScreenTitle>Eltern</ScreenTitle>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">Profile</h2>

        {profiles.length === 0 ? (
          <Notice>Noch keine Profile. Lege unten das erste an.</Notice>
        ) : (
          <ul className="flex flex-col gap-3">
            {profiles.map((profile) => (
              <ProfileCard key={profile.id} profile={profile} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4 pt-8">
        <h2 className="text-2xl font-bold">Neues Profil</h2>

        {error ? <Notice tone="error">{error}</Notice> : null}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <TextField
            label="Name"
            value={name}
            maxLength={40}
            onChange={(event) => {
              setName(event.target.value)
            }}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-2 pl-1 font-semibold text-ink-soft">Bild</legend>
            <div className="flex flex-wrap gap-2">
              {AVATARS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={avatar === option}
                  aria-label={`Bild ${option}`}
                  onClick={() => {
                    setAvatar(option)
                  }}
                  className={`size-touch rounded-full text-3xl ${
                    avatar === option ? 'ring-4 ring-primary' : 'bg-surface'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-2 pl-1 font-semibold text-ink-soft">Farbe</legend>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={color === option}
                  aria-label={`Farbe ${option}`}
                  style={{ backgroundColor: option }}
                  onClick={() => {
                    setColor(option)
                  }}
                  className={`size-touch rounded-full ${
                    color === option ? 'ring-4 ring-ink' : ''
                  }`}
                />
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-4 rounded-tile bg-surface p-4">
            <Avatar avatar={avatar} color={color} size="sm" />
            <span className="text-ink-soft">So sieht es aus</span>
          </div>

          <BigButton type="submit" disabled={busy}>
            Profil anlegen
          </BigButton>
        </form>
      </section>

      <SyncNotice />

      <LibrarySection />

      <DownloadsSection />

      <PinSection />

      <ResetSection />

      <section className="flex flex-col gap-4 pt-8">
        <h2 className="text-2xl font-bold">Konto</h2>
        {state.status === 'ready' && state.user.email !== null ? (
          <p className="text-ink-soft">Angemeldet als {state.user.email}</p>
        ) : null}

        {/* Nur das Administratorkonto sieht diesen Weg. Wer sonst darauf
            stösst, bekommt dort ohnehin nichts zu lesen: Die Firestore-Regeln
            geben die Listen nur einer einzigen Adresse heraus. */}
        {isAdmin ? <BigLinkButton to="/admin">Adminbereich</BigLinkButton> : null}

        {/* Erst die Auswahl aufgeben, dann hin: Ein Profil, das nicht wechseln
            darf, schickt die Weiche in `AppRoutes` sonst sofort wieder auf die
            Startseite – und der Knopf sähe kaputt aus. Das ist der Weg, der
            den gesperrten Wechsel öffnet, und er liegt hinter der PIN. */}
        <BigButton
          variant="secondary"
          onClick={() => {
            clearSelection()
            void navigate('/profil')
          }}
        >
          {selected === null || selected.maySwitchProfile
            ? 'Zurück zur Profilauswahl'
            : 'Anderes Kind auswählen'}
        </BigButton>
        <BigButton variant="secondary" onClick={() => void actions.signOut()}>
          Abmelden
        </BigButton>
      </section>
    </Screen>
  )
}
