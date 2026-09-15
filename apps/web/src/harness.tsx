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
import { AuthContext, type AuthContextValue } from './features/auth/authContext'
import type { Book } from './features/library/catalog'
import { parseCatalog, sortBooks } from './features/library/catalog'
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
 */
const TITLES: [string, string | null, string | null][] = [
  ['Die drei ??? Kids - 01 - Der Super-Papagei', 'Die drei ??? Kids', null],
  ['Die drei ??? Kids-02-Der Phantomsee', 'Die drei ??? Kids', null],
  ['Die Drei Fragezeichen Kids - 05 -Mini-Fall - Alarm, die Ritter kommen!', 'Die drei ??? Kids', 'Mini-Fälle'],
  ['Hexerei in der Schule', 'Bibi Blocksberg', null],
  ['Der Weihnachtsmann in der Klemme', null, null],
  ['Die Olchis - 01 - Ein Fall für die Olchis', 'Die Olchis', null],
]

const rohBooks: Book[] = TITLES.map(([sourceTitle, series, group], i) => ({
  id: `b_${String(i)}`,
  title: sourceTitle,
  sourceTitle,
  series,
  group,
  seriesIndex: null,
  author: 'Beispiel-Autorin',
  narrator: null,
  durationSec: 3600 + i * 900,
  cover: i === 4 ? null : `/cover/b_${String(i)}.jpg`,
  coverColor: ['#6d28d9', '#0369a1', '#047857', '#b45309', '#be123c', '#4338ca'][i]!,
  tags: [],
  addedAt: `2026-0${String(i + 1)}-01T00:00:00.000Z`,
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
  currentTicket: () => 't',
  fetchCatalog: () => Promise.resolve({ status: 'not-modified' as const }),
  coverUrl: (path) => cover(Number(/b_(\d+)/.exec(path)?.[1] ?? 0) * 55),
  audioUrl: () => null,
  canonicalAudioUrl: () => '',
  canonicalCoverUrl: (path) => path,
  forgetTicket: () => undefined,
}

const profile = {
  id: 'p1',
  name: 'Emma',
  avatar: '🦊',
  color: '#6d28d9',
  // In der Vorschau freigegeben, sonst wäre der Download-Knopf nie zu sehen.
  allowDownload: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const profiles: ProfilesContextValue = {
  loading: false,
  profiles: [profile],
  selected: profile,
  select: () => undefined,
  clearSelection: () => undefined,
  create: () => Promise.resolve(),
  update: () => Promise.resolve(),
  remove: () => Promise.resolve(),
}

function Harness() {
  const [library, setLibrary] = useState<LibraryContextValue>(() => ({
    status: mediaBase === null ? 'ready' : 'loading',
    books: mediaBase === null ? demoBooks : [],
    fromCache: false,
    error: null,
    skipped: 0,
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
    })
    window.localStorage.setItem(
      'hb.mediaTicket',
      JSON.stringify({ ticket, expiresAt: Date.now() + 3_600_000 }),
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
        fromCache: false,
        error: null,
        skipped: parsed.ok ? parsed.skipped : 0,
        refresh: () => undefined,
        bookById: (id) => books.find((book) => book.id === id),
        client,
      })
    })()
  }, [])

  return (
    <MemoryRouter initialEntries={[route]}>
      <AuthContext value={auth}>
        <ParentProvider>
          <ProfilesContext value={profiles}>
            <LibraryContext value={library}>
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
      </AuthContext>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
