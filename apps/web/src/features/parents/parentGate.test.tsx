import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '@/features/auth/authContext'

import { ParentProvider, FRESH_SIGN_IN_MS } from './ParentProvider'
import { PinGate } from './PinGate'
import { makeStoredPin } from './pin'

const getDoc = vi.fn()
const setDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => ({ path: args.join('/') }),
  getDoc: (...args: unknown[]) => getDoc(...args) as unknown,
  setDoc: (...args: unknown[]) => setDoc(...args) as unknown,
}))

vi.mock('@/lib/firebase', () => ({ getFirebase: () => ({ db: {} }) }))
vi.mock('@/lib/env', () => ({
  readFirebaseConfig: () => ({ ok: true, config: {} }),
}))

const JETZT = 1_800_000_000_000

function makeAuth(lastSignInTime: string | undefined): AuthContextValue {
  return {
    state: {
      status: 'ready',
      // `undefined` steht hier ausdrücklich für „gar keine metadata".
      user: (lastSignInTime === undefined
        ? { uid: 'u1' }
        : { uid: 'u1', metadata: { lastSignInTime } }) as AuthContextValue['state'] extends {
        user: infer U
      }
        ? U
        : never,
    },
    isAdmin: false,
    actions: {
      signInWithPassword: vi.fn().mockResolvedValue(undefined),
      signInWithGoogle: vi.fn().mockResolvedValue(undefined),
      sendLoginLink: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn().mockResolvedValue(undefined),
      recheckAccess: vi.fn().mockResolvedValue(undefined),
    },
    linkError: null,
    clearLinkError: vi.fn(),
  }
}

/** Ein Anmeldezeitpunkt, der lange genug her ist, um nicht mehr zu zählen. */
const ALT = new Date(JETZT - FRESH_SIGN_IN_MS - 60_000).toUTCString()
const GERADE_EBEN = new Date(JETZT - 1000).toUTCString()

function zeigen(lastSignInTime: string | undefined = ALT) {
  return render(
    <MemoryRouter>
      <AuthContext value={makeAuth(lastSignInTime)}>
        <ParentProvider now={() => JETZT}>
          <PinGate>
            <p>Elternbereich</p>
          </PinGate>
        </ParentProvider>
      </AuthContext>
    </MemoryRouter>,
  )
}

async function tippen(pin: string): Promise<void> {
  for (const ziffer of pin) {
    await userEvent.click(screen.getByRole('button', { name: ziffer }))
  }
}

describe('Schloss vor dem Elternbereich', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('lässt ohne gesetzte PIN durch', async () => {
    // Niemand soll vor einer Tür stehen, die er nie abgeschlossen hat.
    getDoc.mockResolvedValue({ data: () => ({ uid: 'u1' }) })
    zeigen()

    await waitFor(() => {
      expect(screen.getByText('Elternbereich')).toBeInTheDocument()
    })
  })

  it('sperrt, sobald eine PIN gesetzt ist', async () => {
    getDoc.mockResolvedValue({
      data: () => ({ pinSalt: 'aa', pinHash: 'bb' }),
    })
    zeigen()

    await waitFor(() => {
      expect(screen.getByText('PIN eingeben')).toBeInTheDocument()
    })
    expect(screen.queryByText('Elternbereich')).not.toBeInTheDocument()
  })

  it('öffnet bei der richtigen PIN', async () => {
    const stored = await makeStoredPin('2739')
    getDoc.mockResolvedValue({
      data: () => ({ pinSalt: stored.salt, pinHash: stored.hash }),
    })
    zeigen()
    await waitFor(() => {
      expect(screen.getByText('PIN eingeben')).toBeInTheDocument()
    })

    await tippen('2739')

    await waitFor(() => {
      expect(screen.getByText('Elternbereich')).toBeInTheDocument()
    })
  })

  it('sagt bei der falschen PIN Bescheid und bleibt zu', async () => {
    const stored = await makeStoredPin('2739')
    getDoc.mockResolvedValue({
      data: () => ({ pinSalt: stored.salt, pinHash: stored.hash }),
    })
    zeigen()
    await waitFor(() => {
      expect(screen.getByText('PIN eingeben')).toBeInTheDocument()
    })

    await tippen('1111')

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('nicht die richtige PIN')
    })
    expect(screen.queryByText('Elternbereich')).not.toBeInTheDocument()
  })

  it('lässt nach einer frischen Anmeldung einmal ohne PIN hinein', async () => {
    // Der Weg aus einer vergessenen PIN. Ohne ihn wäre sie eine Sackgasse,
    // die ausgerechnet die Eltern aus ihrem eigenen Bereich aussperrt.
    getDoc.mockResolvedValue({ data: () => ({ pinSalt: 'aa', pinHash: 'bb' }) })
    zeigen(GERADE_EBEN)

    await waitFor(() => {
      expect(screen.getByText('Elternbereich')).toBeInTheDocument()
    })
  })

  it('bietet beim Vergessen den Weg über das Abmelden an', async () => {
    getDoc.mockResolvedValue({ data: () => ({ pinSalt: 'aa', pinHash: 'bb' }) })
    zeigen()
    await waitFor(() => {
      expect(screen.getByText('PIN eingeben')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'PIN vergessen?' }))

    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
  })

  it('sperrt nicht aus, wenn die Datenbank nicht antwortet', async () => {
    // Kein Netz, keine Freigabe: Dann lieber offen als ausgesperrt – der
    // Elternbereich enthält nichts, was ohne Konto Schaden anrichtet.
    getDoc.mockRejectedValue(new Error('offline'))
    zeigen()

    await waitFor(() => {
      expect(screen.getByText('Elternbereich')).toBeInTheDocument()
    })
  })

  it('merkt die PIN auf diesem Gerät, wenn jemand es verlangt', async () => {
    // Für das eigene Telefon: Dort ist die PIN eine Hürde ohne Zweck, denn wer
    // das Telefon entsperrt hat, ist ohnehin schon drin.
    const stored = await makeStoredPin('2739')
    getDoc.mockResolvedValue({
      data: () => ({ pinSalt: stored.salt, pinHash: stored.hash }),
    })
    const erste = zeigen()
    await waitFor(() => {
      expect(screen.getByText('PIN eingeben')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('checkbox', { name: 'Auf diesem Gerät merken' }))
    await tippen('2739')
    await waitFor(() => {
      expect(screen.getByText('Elternbereich')).toBeInTheDocument()
    })
    erste.unmount()

    // Neu gestartet: Ohne das Gemerkte stünde hier wieder die Tastatur.
    zeigen()
    await waitFor(() => {
      expect(screen.getByText('Elternbereich')).toBeInTheDocument()
    })
  })

  it('verlangt die PIN beim nächsten Start, wenn niemand sie merken wollte', async () => {
    // Das ist der Fall auf dem Kindertablett – dort ist die PIN der ganze Zweck.
    const stored = await makeStoredPin('2739')
    getDoc.mockResolvedValue({
      data: () => ({ pinSalt: stored.salt, pinHash: stored.hash }),
    })
    const erste = zeigen()
    await waitFor(() => {
      expect(screen.getByText('PIN eingeben')).toBeInTheDocument()
    })

    await tippen('2739')
    await waitFor(() => {
      expect(screen.getByText('Elternbereich')).toBeInTheDocument()
    })
    erste.unmount()

    zeigen()
    await waitFor(() => {
      expect(screen.getByText('PIN eingeben')).toBeInTheDocument()
    })
  })

  it('stürzt nicht ab, wenn das Konto keine Zeitangaben mitbringt', async () => {
    // Im echten Firebase gibt es `metadata` immer. Fehlt es doch einmal, darf
    // daran nicht die ganze App hängen – für eine Bequemlichkeit, die auch
    // einfach entfallen kann.
    getDoc.mockResolvedValue({ data: () => ({ uid: 'u1' }) })
    zeigen(undefined)

    await waitFor(() => {
      expect(screen.getByText('Elternbereich')).toBeInTheDocument()
    })
  })
})
