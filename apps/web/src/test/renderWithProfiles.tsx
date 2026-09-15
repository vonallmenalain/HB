import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

import type { DownloadRecord } from '@/features/downloads/downloads'
import {
  DownloadsContext,
  type DownloadsContextValue,
} from '@/features/downloads/downloadsContext'
import type { Book } from '@/features/library/catalog'
import {
  LibraryContext,
  type LibraryContextValue,
} from '@/features/library/libraryContext'
import { PlayerContext, type PlayerContextValue } from '@/features/player/playerContext'
import type { Progress } from '@/features/progress/progress'
import {
  ProgressContext,
  type ProgressContextValue,
} from '@/features/progress/progressContext'
import type { Profile } from '@/features/profiles/profile'
import {
  ProfilesContext,
  type ProfilesContextValue,
} from '@/features/profiles/profilesContext'

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Emma',
    avatar: '🦊',
    color: '#6d28d9',
    allowDownload: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'b_1',
    title: 'Der Super-Papagei',
    sourceTitle: 'Der Super-Papagei',
    series: 'Die drei ???',
    group: null,
    seriesIndex: 1,
    author: 'Robert Arthur',
    narrator: null,
    durationSec: 600,
    cover: null,
    coverColor: '#6d28d9',
    tags: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    filesHash: 'abc',
    files: [{ idx: 0, durationSec: 600, bytes: 100, mime: 'audio/mpeg' }],
    chapters: [{ idx: 0, title: 'Kapitel 1', fileIdx: 0, startSec: 0, endSec: 600 }],
    ...overrides,
  }
}

export function makeProfilesValue(
  overrides: Partial<ProfilesContextValue> = {},
): ProfilesContextValue {
  return {
    loading: false,
    profiles: [],
    selected: null,
    select: vi.fn(),
    clearSelection: vi.fn(),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

export function makeLibraryValue(
  overrides: Partial<LibraryContextValue> = {},
): LibraryContextValue {
  const books = overrides.books ?? []
  return {
    status: 'ready',
    books,
    fromCache: false,
    error: null,
    skipped: 0,
    refresh: vi.fn(),
    bookById: (id: string) => books.find((book) => book.id === id),
    client: null,
    ...overrides,
  }
}

export function makeProgressEntry(overrides: Partial<Progress> = {}): Progress {
  return {
    bookId: 'b_1',
    positionSec: 300,
    fileIdx: 0,
    offsetSec: 300,
    filesHash: 'abc',
    durationSec: 600,
    finished: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeProgressValue(
  overrides: Partial<ProgressContextValue> = {},
): ProgressContextValue {
  const entries = overrides.entries ?? new Map<string, Progress>()
  return {
    entries,
    loading: false,
    syncState: 'off',
    get: (bookId: string) => entries.get(bookId) ?? null,
    save: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  }
}

export function makeDownloadRecord(
  overrides: Partial<DownloadRecord> = {},
): DownloadRecord {
  return {
    bookId: 'b_1',
    status: 'done',
    filesTotal: 1,
    filesDone: 1,
    bytesTotal: 1_000_000,
    bytesDone: 1_000_000,
    filesHash: 'abc',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeDownloadsValue(
  overrides: Partial<DownloadsContextValue> = {},
): DownloadsContextValue {
  const records = overrides.records ?? new Map<string, DownloadRecord>()
  return {
    records,
    allowed: false,
    supported: true,
    background: false,
    transfer: null,
    storage: null,
    get: (bookId: string) => records.get(bookId) ?? null,
    start: vi.fn(),
    cancel: vi.fn(),
    remove: vi.fn(),
    offlineUrl: () => null,
    offlineCoverUrl: () => null,
    ...overrides,
  }
}

export function makePlayerValue(
  overrides: Partial<PlayerContextValue> = {},
): PlayerContextValue {
  return {
    book: null,
    positionSec: 0,
    durationSec: 0,
    playing: false,
    loading: false,
    finished: false,
    error: false,
    chapter: null,
    sleepMode: null,
    sleepRemainingSec: 0,
    playBook: vi.fn(),
    playFrom: vi.fn(),
    toggle: vi.fn(),
    skip: vi.fn(),
    nextChapter: vi.fn(),
    previousChapter: vi.fn(),
    seekTo: vi.fn(),
    setSleep: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  }
}

export function renderWithProfiles(
  ui: ReactElement,
  value: ProfilesContextValue,
  {
    route = '/',
    library = makeLibraryValue(),
    progress = makeProgressValue(),
    downloads = makeDownloadsValue(),
    player = makePlayerValue(),
  }: {
    route?: string
    library?: LibraryContextValue
    progress?: ProgressContextValue
    downloads?: DownloadsContextValue
    player?: PlayerContextValue
  } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <ProfilesContext value={value}>
          <LibraryContext value={library}>
            <ProgressContext value={progress}>
              <DownloadsContext value={downloads}>
                <PlayerContext value={player}>{children}</PlayerContext>
              </DownloadsContext>
            </ProgressContext>
          </LibraryContext>
        </ProfilesContext>
      </MemoryRouter>
    )
  }

  return render(ui, { wrapper: Wrapper })
}
