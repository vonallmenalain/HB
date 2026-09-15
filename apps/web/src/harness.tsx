/**
 * Vorschau ohne Anmeldung.
 *
 *   npm run dev
 *   http://localhost:5173/harness.html?route=/bibliothek
 *
 * Rendert die Bildschirme mit Beispieldaten, damit sich Layout und Verhalten
 * ansehen lassen, ohne ein Firebase-Konto und ein laufendes NAS zu brauchen.
 * Nicht Teil des Produktionsbuilds – `vite build` baut nur index.html.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

import { AppRoutes } from './app/AppRoutes'
import type { Book } from './features/library/catalog'
import { LibraryContext, type LibraryContextValue } from './features/library/libraryContext'
import { ProfilesContext, type ProfilesContextValue } from './features/profiles/profilesContext'
import './index.css'

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

const TITLES = [
  ['Der Super-Papagei', 'Die drei ???', 1],
  ['Der Phantomsee', 'Die drei ???', 2],
  ['Das Bergmonster', 'Die drei ???', 3],
  ['Hexerei in der Schule', 'Bibi Blocksberg', null],
  ['Der Weihnachtsmann in der Klemme', null, null],
  ['Ein Fall für die Olchis', 'Die Olchis', 1],
] as const

const books: Book[] = TITLES.map(([title, series, index], i) => ({
  id: `b_${String(i)}`,
  title,
  series,
  seriesIndex: index,
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
    { idx: 1, title: 'Die Spur führt zum See', fileIdx: 1, startSec: 1800, endSec: 3600 + i * 900 },
  ],
}))

const library: LibraryContextValue = {
  status: 'ready',
  books,
  fromCache: false,
  error: null,
  skipped: 0,
  refresh: () => undefined,
  bookById: (id) => books.find((book) => book.id === id),
  client: {
    ensureTicket: () => Promise.resolve('t'),
    currentTicket: () => 't',
    fetchCatalog: () => Promise.resolve({ status: 'not-modified' as const }),
    coverUrl: (path) => cover(Number(/b_(\d+)/.exec(path)?.[1] ?? 0) * 55),
    audioUrl: () => null,
    canonicalAudioUrl: () => '',
    forgetTicket: () => undefined,
  },
}

const profile = {
  id: 'p1',
  name: 'Emma',
  avatar: '🦊',
  color: '#6d28d9',
  allowDownload: false,
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

const route = new URLSearchParams(window.location.search).get('route') ?? '/'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[route]}>
      <ProfilesContext value={profiles}>
        <LibraryContext value={library}>
          <AppRoutes />
        </LibraryContext>
      </ProfilesContext>
    </MemoryRouter>
  </StrictMode>,
)
