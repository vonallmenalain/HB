import { useId, useState } from 'react'

import { useAges } from '@/features/library/agesContext'
import { useLibrary } from '@/features/library/libraryContext'
import { bookLabel } from '@/features/library/titles'
import { Avatar } from '@/ui/Avatar'
import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'
import { TextField } from '@/ui/TextField'

import {
  PROFILE_AGE_MAX,
  PROFILE_AGE_MIN,
  ageLabel,
  minAgeOf,
  visibleBooks,
} from './access'
import { type Profile } from './profile'
import { useProfiles } from './profilesContext'

/** So viele Treffer auf einmal – darunter sucht man weiter, statt zu scrollen. */
const MAX_TREFFER = 15

const ALTER = Array.from(
  { length: PROFILE_AGE_MAX - PROFILE_AGE_MIN + 1 },
  (_, index) => PROFILE_AGE_MIN + index,
)

/**
 * Ein Profil im Elternbereich, mit allem, was es darf.
 *
 * Hier standen bisher zwei Dinge: ein Häkchen für Downloads und ein Link zum
 * Löschen. Dazu kommen jetzt die drei Fragen, die sich im Alltag stellen – wie
 * alt ist das Kind, welches Hörbuch soll es trotz passendem Alter nicht hören,
 * und darf es das Profil wechseln. Alle drei gehören an dieselbe Stelle: Wer
 * sie sucht, sucht sie beim Kind und nicht in einem eigenen Abschnitt weiter
 * unten.
 */
export function ProfileCard({ profile }: { profile: Profile }) {
  const { update, remove } = useProfiles()
  const { allBooks } = useLibrary()
  const { ages } = useAges()

  const alterId = useId()
  const [suche, setSuche] = useState('')
  const [sperrenOffen, setSperrenOffen] = useState(false)
  const [loeschenOffen, setLoeschenOffen] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const gesperrt = new Set(profile.blockedBooks)
  const sichtbare = visibleBooks(allBooks, profile, ages)
  const verborgen = allBooks.length - sichtbare.length

  const speichern = (patch: Parameters<typeof update>[1]): void => {
    setFehler(null)
    void update(profile.id, patch).catch(() => {
      setFehler('Das liess sich nicht speichern.')
    })
  }

  const treffer =
    suche.trim() === ''
      ? []
      : allBooks.filter((book) => {
          const text = `${book.title} ${book.series ?? ''} ${book.group ?? ''}`
          return text.toLowerCase().includes(suche.trim().toLowerCase())
        })

  const sperren = (bookId: string): void => {
    speichern({ blockedBooks: [...profile.blockedBooks, bookId] })
  }

  const freigeben = (bookId: string): void => {
    speichern({ blockedBooks: profile.blockedBooks.filter((id) => id !== bookId) })
  }

  return (
    <li className="flex flex-col gap-3 rounded-tile bg-surface p-4">
      <div className="flex items-center gap-4">
        <Avatar avatar={profile.avatar} color={profile.color} size="sm" />
        <span className="flex-1 text-xl font-semibold">{profile.name}</span>
      </div>

      {fehler !== null ? <Notice tone="error">{fehler}</Notice> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={alterId} className="pl-1 font-semibold text-ink-soft">
          Alter
        </label>
        <select
          id={alterId}
          value={profile.ageYears === null ? '' : String(profile.ageYears)}
          onChange={(event) => {
            const wert = event.target.value
            speichern({ ageYears: wert === '' ? null : Number(wert) })
          }}
          className="min-h-touch rounded-tile border-2 border-control bg-surface px-4 text-xl focus-visible:border-primary focus-visible:outline-4 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          <option value="">Nicht gesetzt</option>
          {ALTER.map((jahre) => (
            <option key={jahre} value={String(jahre)}>
              {jahre} Jahre
            </option>
          ))}
        </select>
        <p className="pl-1 text-sm text-ink-soft">
          {profile.ageYears === null
            ? 'Ohne Alter sieht das Profil nur Hörbücher ohne Altersfreigabe.'
            : `Sieht Hörbücher bis „ab ${String(profile.ageYears)} Jahren".`}
        </p>
      </div>

      <label className="flex min-h-touch items-center gap-3 rounded-tile bg-surface-sunken px-4">
        <input
          type="checkbox"
          className="size-6 accent-primary"
          checked={profile.allowDownload}
          onChange={(event) => {
            speichern({ allowDownload: event.target.checked })
          }}
        />
        <span>Darf Hörbücher herunterladen</span>
      </label>

      {/* Der Wechsel ist standardmässig aus. Das Häkchen macht ihn wieder
          möglich – für das Gerät, auf dem sich zwei Kinder abwechseln. */}
      <label className="flex min-h-touch items-center gap-3 rounded-tile bg-surface-sunken px-4">
        <input
          type="checkbox"
          className="size-6 accent-primary"
          checked={profile.maySwitchProfile}
          onChange={(event) => {
            speichern({ maySwitchProfile: event.target.checked })
          }}
        />
        <span>Darf das Profil wechseln</span>
      </label>

      <p className="text-sm text-ink-soft">
        {verborgen === 0
          ? `Sieht alle ${String(allBooks.length)} Hörbücher.`
          : `Sieht ${String(sichtbare.length)} von ${String(allBooks.length)} Hörbüchern – ${String(
              verborgen,
            )} verborgen, davon ${String(profile.blockedBooks.length)} einzeln gesperrt.`}
      </p>

      {sperrenOffen ? (
        <div className="flex flex-col gap-3 rounded-tile bg-surface-sunken p-3">
          {profile.blockedBooks.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {profile.blockedBooks.map((bookId) => {
                const book = allBooks.find((entry) => entry.id === bookId)
                return (
                  <li key={bookId} className="flex items-center gap-3">
                    <span className="flex-1">
                      {book ? bookLabel(book) : 'Nicht mehr im Katalog'}
                    </span>
                    <button
                      type="button"
                      // Mit dem Namen des Kindes davor: Auf dem Bildschirm sagt
                      // die Karte, um wen es geht – vorgelesen fehlte das.
                      aria-label={`${profile.name}: ${
                        book ? bookLabel(book) : bookId
                      } wieder freigeben`}
                      className="min-h-touch rounded-tile px-2 underline"
                      onClick={() => {
                        freigeben(bookId)
                      }}
                    >
                      Freigeben
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-ink-soft">Bisher ist für {profile.name} nichts gesperrt.</p>
          )}

          <TextField
            label="Hörbuch suchen"
            value={suche}
            onChange={(event) => {
              setSuche(event.target.value)
            }}
          />

          {suche.trim() === '' ? (
            <p className="text-sm text-ink-soft">
              Erst suchen: {allBooks.length} Hörbücher sind zu viele für eine Liste.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {treffer.slice(0, MAX_TREFFER).map((book) => (
                <li key={book.id} className="flex items-center gap-3">
                  <span className="flex-1">
                    {bookLabel(book)}
                    {minAgeOf(ages, book.id) > 0 ? (
                      <span className="text-sm text-ink-soft">
                        {' '}
                        · {ageLabel(minAgeOf(ages, book.id))}
                      </span>
                    ) : null}
                  </span>
                  {gesperrt.has(book.id) ? (
                    <span className="text-sm text-ink-soft">gesperrt</span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`${profile.name}: ${bookLabel(book)} sperren`}
                      className="min-h-touch rounded-tile px-2 underline"
                      onClick={() => {
                        sperren(book.id)
                      }}
                    >
                      Sperren
                    </button>
                  )}
                </li>
              ))}
              {treffer.length === 0 ? (
                <li className="text-ink-soft">Nichts gefunden.</li>
              ) : null}
            </ul>
          )}

          <button
            type="button"
            className="min-h-touch self-start rounded-tile px-2 text-ink-soft underline"
            onClick={() => {
              setSperrenOffen(false)
              setSuche('')
            }}
          >
            Fertig
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="min-h-touch self-start rounded-tile px-2 underline"
          onClick={() => {
            setSperrenOffen(true)
          }}
        >
          Einzelne Hörbücher sperren
          {profile.blockedBooks.length > 0 ? ` (${String(profile.blockedBooks.length)})` : ''}
        </button>
      )}

      {loeschenOffen ? (
        <div className="flex flex-col gap-2">
          <Notice tone="error">
            {profile.name} wirklich löschen? Der Hörfortschritt dieses Profils geht dabei
            verloren.
          </Notice>
          <div className="flex gap-2">
            <BigButton
              onClick={() => {
                void remove(profile.id)
                setLoeschenOffen(false)
              }}
            >
              Ja, löschen
            </BigButton>
            <BigButton
              variant="secondary"
              onClick={() => {
                setLoeschenOffen(false)
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
            setLoeschenOffen(true)
          }}
        >
          Profil löschen
        </button>
      )}
    </li>
  )
}
