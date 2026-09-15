import { type FormEvent, useState } from 'react'

import { useAuth } from '@/features/auth/authContext'
import { SyncNotice } from '@/features/progress/SyncNotice'
import { Avatar } from '@/ui/Avatar'
import { BigButton, BigLinkButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'
import { Screen, ScreenTitle } from '@/ui/Screen'
import { TextField } from '@/ui/TextField'

import { AVATARS, COLORS, checkProfileName } from './profile'
import { useProfiles } from './profilesContext'

/**
 * Elternbereich: Profile anlegen, Downloads freigeben, abmelden.
 *
 * Noch ohne PIN – die kommt laut Konzept mit M8. Bis dahin ist dieser
 * Bildschirm über einen bewusst unauffälligen Link erreichbar.
 */
export function ManageProfilesScreen() {
  const { profiles, create, update, remove } = useProfiles()
  const { state, actions } = useAuth()

  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string>(AVATARS[0])
  const [color, setColor] = useState<string>(COLORS[0])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

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
              <li
                key={profile.id}
                className="flex flex-col gap-3 rounded-tile bg-surface p-4"
              >
                <div className="flex items-center gap-4">
                  <Avatar avatar={profile.avatar} color={profile.color} size="sm" />
                  <span className="flex-1 text-xl font-semibold">{profile.name}</span>
                </div>

                <label className="flex min-h-touch items-center gap-3 rounded-tile bg-surface-sunken px-4">
                  <input
                    type="checkbox"
                    className="size-6 accent-primary"
                    checked={profile.allowDownload}
                    onChange={(event) => {
                      void update(profile.id, { allowDownload: event.target.checked })
                    }}
                  />
                  <span>Darf Hörbücher herunterladen</span>
                </label>

                {confirmingDelete === profile.id ? (
                  <div className="flex flex-col gap-2">
                    <Notice tone="error">
                      {profile.name} wirklich löschen? Der Hörfortschritt dieses Profils geht
                      dabei verloren.
                    </Notice>
                    <div className="flex gap-2">
                      <BigButton
                        onClick={() => {
                          void remove(profile.id)
                          setConfirmingDelete(null)
                        }}
                      >
                        Ja, löschen
                      </BigButton>
                      <BigButton
                        variant="secondary"
                        onClick={() => {
                          setConfirmingDelete(null)
                        }}
                      >
                        Abbrechen
                      </BigButton>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="min-h-touch self-start rounded-tile px-2 text-ink-soft underline"
                    onClick={() => {
                      setConfirmingDelete(profile.id)
                    }}
                  >
                    Profil löschen
                  </button>
                )}
              </li>
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

      <section className="flex flex-col gap-4 pt-8">
        <h2 className="text-2xl font-bold">Konto</h2>
        {state.status === 'ready' && state.user.email !== null ? (
          <p className="text-ink-soft">Angemeldet als {state.user.email}</p>
        ) : null}
        <BigLinkButton to="/profil" variant="secondary">
          Zurück zur Profilauswahl
        </BigLinkButton>
        <BigButton variant="secondary" onClick={() => void actions.signOut()}>
          Abmelden
        </BigButton>
      </section>
    </Screen>
  )
}
