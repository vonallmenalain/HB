/* eslint-disable react-refresh/only-export-components --
 * Einstiegspunkt wie main.tsx: Die Datei wird nie importiert, sondern von
 * harness.html geladen. Fast Refresh spielt hier keine Rolle.
 */

/**
 * Vorschau ohne Anmeldung.
 *
 *   npm run dev
 *   http://localhost:5173/harness.html?route=/bibliothek
 *
 * Rendert die Bildschirme mit Beispieldaten, damit sich Layout und Verhalten
 * ansehen lassen, ohne ein Firebase-Konto und ein laufendes NAS zu brauchen.
 *
 * Mit `?media=http://localhost:8099&ticket=…` läuft sie stattdessen gegen einen
 * echten Medien-Dienst: Katalog, Cover und Ton kommen dann von dort. Nur die
 * Anmeldung bleibt überbrückt – so lässt sich der Player mit echtem Audio
 * prüfen.
 *
 * Mit `?sync=1` tritt an die Stelle von Firestore eine Cloud aus localStorage.
 * Zwei offene Tabs sind dann zwei Geräte: Was im einen läuft, erscheint im
 * anderen.
 *
 * Die Anmeldung wird durch einen festen Kontext ersetzt – sonst liesse sich der
 * Elternbereich hier gar nicht öffnen. Nicht Teil des Produktionsbuilds.
 */
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { User } from 'firebase/auth'
import { MemoryRouter } from 'react-router-dom'

import { AppRoutes } from './app/AppRoutes'
import { AdminContext, type AdminContextValue } from './features/admin/adminContext'
import { AuthContext, type AuthContextValue } from './features/auth/authContext'
import { FavoritesContext } from './features/favorites/favoritesContext'
import { AgesContext } from './features/library/agesContext'
import { TitlesContext } from './features/library/titlesContext'
import type { Book } from './features/library/catalog'
import { SUPPORTED_SCHEMA_VERSION, parseCatalog, sortBooks } from './features/library/catalog'
import { LibraryContext, type LibraryContextValue } from './features/library/libraryContext'
import { tidyBook, tidyBooks } from './features/library/titles'
import { createMediaClient } from './features/library/mediaClient'
import { NowPlayingBar } from './features/player/NowPlayingBar'
import { PlayerProvider } from './features/player/PlayerProvider'
import type { ProgressCloud } from './features/progress/cloud'
import type { Progress } from './features/progress/progress'
import { DownloadProvider } from './features/downloads/DownloadProvider'
import { ParentProvider } from './features/parents/ParentProvider'
import { ProgressStore } from './features/progress/ProgressProvider'
import { parseRemoteProgress, toRemoteDoc } from './features/progress/sync'
import { visibleBooks } from './features/profiles/access'
import { type Profile } from './features/profiles/profile'
import { ProfilesContext, type ProfilesContextValue } from './features/profiles/profilesContext'
import './index.css'

const params = new URLSearchParams(window.location.search)
const route = params.get('route') ?? '/'
const mediaBase = params.get('media')
const ticket = params.get('ticket')
const syncDemo = params.get('sync') === '1'

/**
 * Ein angemeldetes Konto, das es nicht gibt.
 *
 * Der Elternbereich fragt nach der Anmeldung – ohne diesen Zustand liesse er
 * sich in der Vorschau gar nicht öffnen. Gestellt wird nur der Kontext, nicht
 * der `AuthProvider`: Es wird nichts an Firebase geschickt.
 */
const auth: AuthContextValue = {
  state: {
    status: 'ready',
    user: {
      uid: 'uid-vorschau',
      email: 'vorschau@example.com',
      metadata: {},
    } as unknown as User,
  },
  // In der Vorschau ist der Adminbereich offen – sonst liesse er sich gar
  // nicht ansehen, ohne sich anzumelden.
  isAdmin: true,
  actions: {
    signInWithPassword: () => Promise.resolve(),
    signInWithGoogle: () => Promise.resolve(),
    sendLoginLink: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    recheckAccess: () => Promise.resolve(),
  },
  linkError: null,
  clearLinkError: () => undefined,
}

/**
 * Firestore-Ersatz aus localStorage – nur für die Vorschau.
 *
 * Reicht, weil `ProgressStore` von Firestore ohnehin nur zwei Dinge braucht:
 * einen Strom von Ständen und eine Stelle zum Hinschreiben. Zwei Tabs teilen
 * sich denselben Speicher und benachrichtigen sich über das `storage`-Ereignis
 * – damit läuft der Abgleich im echten Browser, samt Zusammenführen und
 * Reparatur, ohne dass ein Firebase-Konto nötig wäre.
 */
function localStorageCloud(profileId: string): ProgressCloud {
  const key = `hb.harness.cloud.${profileId}`

  const read = (): ReadonlyMap<string, Progress> => {
    const entries = new Map<string, Progress>()
    try {
      const raw: unknown = JSON.parse(window.localStorage.getItem(key) ?? '{}')
      if (typeof raw !== 'object' || raw === null) return entries
      for (const [bookId, data] of Object.entries(raw)) {
        const entry = parseRemoteProgress(bookId, data)
        if (entry !== null) entries.set(bookId, entry)
      }
    } catch {
      // Kaputter Speicher: wie eine leere Cloud behandeln.
    }
    return entries
  }

  return {
    subscribe(onEntries) {
      const push = (): void => {
        onEntries(read(), true)
      }
      // Erst der eigene Stand, dann Änderungen aus dem anderen Tab.
      const timer = setTimeout(push, 0)
      window.addEventListener('storage', push)
      return () => {
        clearTimeout(timer)
        window.removeEventListener('storage', push)
      }
    },
    write(progress) {
      const raw: unknown = JSON.parse(window.localStorage.getItem(key) ?? '{}')
      const all = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
      all[progress.bookId] = toRemoteDoc(progress, 'vorschau')
      window.localStorage.setItem(key, JSON.stringify(all))
      // `storage` feuert nur in *anderen* Tabs; im eigenen muss der Stand
      // selbst zurückkommen, damit sich das Zusammenführen so verhält wie bei
      // Firestore.
      window.dispatchEvent(new StorageEvent('storage', { key }))
    },
  }
}

const cover = (hue: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${String(hue)} 70% 55%)"/>
        <stop offset="1" stop-color="hsl(${String((hue + 40) % 360)} 70% 35%)"/>
      </linearGradient></defs>
      <rect width="300" height="300" fill="url(#g)"/>
      <circle cx="150" cy="120" r="55" fill="#fff" opacity="0.85"/>
      <rect x="60" y="205" width="180" height="16" rx="8" fill="#fff" opacity="0.7"/>
      <rect x="90" y="235" width="120" height="12" rx="6" fill="#fff" opacity="0.5"/>
    </svg>`,
  )}`

/**
 * Beispieltitel, absichtlich so krumm wie auf einem echten NAS: Reihenname im
 * Ordnernamen, Nummern mit und ohne Leerzeichen, ein Unterordner. So zeigt die
 * Vorschau, was das Aufräumen der Titel tatsächlich tut.
 *
 * Die letzten drei liegen in keiner Reihe – ein Einzelbuch und zwei Sprachkurse,
 * wie sie als eigener Ordner im Stamm liegen. Sie gehören in die Vorschau, weil
 * sie in der Übersicht als gewöhnliche Kachel zwischen den Reihen stehen und
 * nicht in einem Sammelfach.
 */
const TITLES: [string, string | null, string | null][] = [
  ['Die drei ??? Kids - 01 - Der Super-Papagei', 'Die drei ??? Kids', null],
  ['Die drei ??? Kids-02-Der Phantomsee', 'Die drei ??? Kids', null],
  ['Die Drei Fragezeichen Kids - 05 -Mini-Fall - Alarm, die Ritter kommen!', 'Die drei ??? Kids', 'Mini-Fälle'],
  ['Hexerei in der Schule', 'Bibi Blocksberg', null],
  ['Der Weihnachtsmann in der Klemme', null, null],
  ['Die Olchis - 01 - Ein Fall für die Olchis', 'Die Olchis', null],
  ['Englisch', null, null],
  ['Französisch', null, null],
]

/**
 * Eine lange Reihe, damit sich die Altersfreigabe im Adminbereich ansehen
 * lässt: Der interessante Fall dort sind zweihundert Folgen, nicht drei.
 */
const LANGE_REIHE: [string, string | null, string | null][] = Array.from(
  { length: 60 },
  (_, i) => [
    `Die drei ??? - ${String(i + 1).padStart(3, '0')} - Fall ${String(i + 1)}`,
    'Die drei ???',
    null,
  ],
)

const rohBooks: Book[] = [...TITLES, ...LANGE_REIHE].map(([folderName, series, group], i) => ({
  id: `b_${String(i)}`,
  title: folderName,
  folderName,
  series,
  group,
  seriesIndex: null,
  author: 'Beispiel-Autorin',
  narrator: null,
  durationSec: 3600 + i * 900,
  cover: i === 4 ? null : `/cover/b_${String(i)}.jpg`,
  // Zyklisch, damit die Liste auch für eine lange Reihe reicht.
  coverColor: [
    '#6d28d9',
    '#0369a1',
    '#047857',
    '#b45309',
    '#be123c',
    '#4338ca',
    '#0f766e',
    '#7c2d12',
  ][i % 8]!,
  tags: [],
  addedAt: `2026-${String((i % 12) + 1).padStart(2, '0')}-01T00:00:00.000Z`,
  filesHash: 'x',
  files: [
    { idx: 0, durationSec: 1800, bytes: 1, mime: 'audio/mpeg' },
    { idx: 1, durationSec: 1800 + i * 900, bytes: 1, mime: 'audio/mpeg' },
  ],
  chapters: [
    { idx: 0, title: 'Ein seltsamer Anruf', fileIdx: 0, startSec: 0, endSec: 1800 },
    {
      idx: 1,
      title: 'Die Spur führt zum See',
      fileIdx: 1,
      startSec: 1800,
      endSec: 3600 + i * 900,
    },
  ],
}))

const demoBooks = sortBooks(rohBooks.map((book) => tidyBook(book)))

const demoClient: LibraryContextValue['client'] = {
  ensureTicket: () => Promise.resolve('t'),
  renewTicket: () => Promise.resolve('t'),
  currentTicket: () => 't',
  fetchCatalog: () => Promise.resolve({ status: 'not-modified' as const }),
  startRescan: () => Promise.resolve('started' as const),
  fetchStatus: () =>
    Promise.resolve({
      scanning: false,
      books: demoBooks.length,
      schemaVersion: 2,
      scannedAt: new Date().toISOString(),
    }),
  // In der Vorschau gibt es kein NAS, das etwas umstellen könnte – die Liste
  // bleibt leer, die Aufrufe tun nichts.
  fetchFolders: () =>
    Promise.resolve([
      {
        path: 'Die Drei Ausrufezeichen',
        books: 1,
        files: 94,
        titles: ['Die Drei Ausrufezeichen'],
        mode: null,
      },
    ]),
  setFolderMode: () => Promise.resolve(),
  fetchOwnCovers: () => Promise.resolve({}),
  startCoverSearch: () => Promise.resolve('started' as const),
  fetchCoverSearch: () =>
    Promise.resolve({
      stand: {
        laeuft: false,
        erledigt: 0,
        gesamt: 0,
        gesetzt: 0,
        offen: 0,
        hinweis: null,
        beendetAm: null,
      },
      vorschlaege: {},
    }),
  searchCoversFor: () => Promise.resolve([]),
  applyCoverSuggestion: () => Promise.resolve('/cover/x.jpg'),
  suggestionUrl: () => null,
  uploadCover: (bookId: string) => Promise.resolve(`/cover/${bookId}.jpg?v=neu`),
  removeCover: () => Promise.resolve(),
  coverUrl: (path) => cover(Number(/b_(\d+)/.exec(path)?.[1] ?? 0) * 55),
  audioUrl: () => null,
  canonicalAudioUrl: () => '',
  canonicalCoverUrl: (path) => path,
  forgetTicket: () => undefined,
}

const profile: Profile = {
  id: 'p1',
  name: 'Emma',
  avatar: '🦊',
  color: '#6d28d9',
  // In der Vorschau freigegeben, sonst wäre der Download-Knopf nie zu sehen.
  allowDownload: true,
  // Ebenso der Wechsel: Sonst liesse sich die Profilauswahl hier nicht ansehen.
  maySwitchProfile: true,
  ageYears: 8,
  blockedBooks: [],
  createdAt: '2026-01-01T00:00:00.000Z',
}

/**
 * Eine Anfrage, die es nicht gibt – damit der Adminbereich in der Vorschau
 * nicht leer ist und sich das Freigeben ansehen lässt.
 */
const demoAdmin = (
  offen: boolean,
  freigeben: () => void,
): AdminContextValue => ({
  loading: false,
  requests: offen
    ? [
        {
          uid: 'uid-oma',
          email: 'oma@example.com',
          name: 'Oma',
          requestedAt: '2026-09-01T10:00:00.000Z',
          status: 'pending' as const,
        },
      ]
    : [],
  accounts: [
    { uid: 'uid-vorschau', email: 'vorschau@example.com', name: null, admin: true, approvedAt: '' },
    ...(offen
      ? []
      : [
          {
            uid: 'uid-oma',
            email: 'oma@example.com',
            name: 'Oma',
            admin: false,
            approvedAt: '2026-09-01T10:05:00.000Z',
          },
        ]),
  ],
  error: false,
  approve: () => {
    freigeben()
    return Promise.resolve()
  },
  deny: () => Promise.resolve(),
  revoke: () => Promise.resolve(),
})

function Harness() {
  // Sterne, Titel und Freigaben laufen in der Vorschau gegen den Speicher
  // dieses Tabs – so lässt sich alles ausprobieren, ohne Firebase.
  const [favoriten, setFavoriten] = useState<ReadonlySet<string>>(new Set())
  const [titel, setTitel] = useState<ReadonlyMap<string, string>>(new Map())
  const [alter, setAlter] = useState<ReadonlyMap<string, number>>(new Map())
  const [kind, setKind] = useState<Profile>(profile)
  const [offeneAnfrage, setOffeneAnfrage] = useState(true)
  const [library, setLibrary] = useState<LibraryContextValue>(() => ({
    status: mediaBase === null ? 'ready' : 'loading',
    books: mediaBase === null ? demoBooks : [],
    allBooks: mediaBase === null ? demoBooks : [],
    fromCache: false,
    error: null,
    skipped: 0,
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    refresh: () => undefined,
    bookById: (id) => (mediaBase === null ? demoBooks : []).find((book) => book.id === id),
    client: demoClient,
  }))

  useEffect(() => {
    if (mediaBase === null || ticket === null) return

    // Echter Client, aber mit vorab ausgestelltem Ticket statt Firebase-Anmeldung.
    const client = createMediaClient({
      baseUrl: mediaBase,
      getIdToken: () => Promise.resolve(null),
      accountId: () => 'harness',
    })
    window.localStorage.setItem(
      'hb.mediaTicket',
      JSON.stringify({ ticket, expiresAt: Date.now() + 3_600_000, uid: 'harness' }),
    )

    void (async () => {
      const response = await fetch(
        `${mediaBase}/library?t=${encodeURIComponent(ticket)}`,
      )
      const parsed = parseCatalog(await response.json())
      const books = parsed.ok ? tidyBooks(sortBooks(parsed.catalog.books)) : []
      setLibrary({
        status: 'ready',
        books,
        allBooks: books,
        fromCache: false,
        error: null,
        skipped: parsed.ok ? parsed.skipped : 0,
        schemaVersion: parsed.ok ? parsed.catalog.schemaVersion : null,
        refresh: () => undefined,
        bookById: (id) => books.find((book) => book.id === id),
        client,
      })
    })()
  }, [])

  const favoritenWert = {
    ids: favoriten,
    isFavorite: (bookId: string) => favoriten.has(bookId),
    toggle: (bookId: string) => {
      setFavoriten((vorher) => {
        const next = new Set(vorher)
        if (!next.delete(bookId)) next.add(bookId)
        return next
      })
    },
  }

  const titelWert = {
    titles: titel,
    setTitle: (bookId: string, neuerTitel: string) => {
      setTitel((vorher) => {
        const next = new Map(vorher)
        if (neuerTitel.trim() === '') next.delete(bookId)
        else next.set(bookId, neuerTitel.trim())
        return next
      })
      return Promise.resolve()
    },
  }

  const profiles: ProfilesContextValue = {
    loading: false,
    profiles: [kind],
    selected: kind,
    select: () => undefined,
    clearSelection: () => undefined,
    create: () => Promise.resolve(),
    update: (_id, patch) => {
      setKind((vorher) => ({
        ...vorher,
        ...patch,
        blockedBooks: patch.blockedBooks ? [...patch.blockedBooks] : vorher.blockedBooks,
      }))
      return Promise.resolve()
    },
    remove: () => Promise.resolve(),
  }

  const setzeAlter = (bookIds: readonly string[], minAge: number): Promise<void> => {
    setAlter((vorher) => {
      const next = new Map(vorher)
      for (const bookId of bookIds) {
        if (minAge <= 0) next.delete(bookId)
        else next.set(bookId, minAge)
      }
      return next
    })
    return Promise.resolve()
  }

  const alterWert = {
    ages: alter,
    setMinAge: (bookId: string, minAge: number) => setzeAlter([bookId], minAge),
    setMinAges: setzeAlter,
  }

  // Titel und Altersfreigaben wirken in der Vorschau sofort – wie in der App,
  // nur ohne Cloud. Gefiltert wird hier genauso: Was das Kind nicht sehen darf,
  // steht in `books` nicht drin, im Eltern- und Adminbereich aber schon.
  const alleBuecher = tidyBooks(library.books, titel)
  const sichtbare = visibleBooks(alleBuecher, kind, alter)
  const bibliothek: LibraryContextValue = {
    ...library,
    books: sichtbare,
    allBooks: alleBuecher,
    bookById: (id) => sichtbare.find((book) => book.id === id),
  }

  return (
    <MemoryRouter initialEntries={[route]}>
      <AuthContext value={auth}>
        <AdminContext
          value={demoAdmin(offeneAnfrage, () => {
            setOffeneAnfrage(false)
          })}
        >
        <TitlesContext value={titelWert}>
        <AgesContext value={alterWert}>
        <FavoritesContext value={favoritenWert}>
        <ParentProvider>
          <ProfilesContext value={profiles}>
            <LibraryContext value={bibliothek}>
              {/* Ohne `?sync=1` gibt es keine Cloud-Seite – der Fortschritt
                  läuft dann rein lokal, wie in der App bei fehlendem Netz. */}
              <ProgressStore cloudFor={syncDemo ? localStorageCloud : undefined}>
                <DownloadProvider>
                  <PlayerProvider>
                    <AppRoutes />
                    <NowPlayingBar />
                  </PlayerProvider>
                </DownloadProvider>
              </ProgressStore>
            </LibraryContext>
          </ProfilesContext>
        </ParentProvider>
        </FavoritesContext>
        </AgesContext>
        </TitlesContext>
        </AdminContext>
      </AuthContext>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
