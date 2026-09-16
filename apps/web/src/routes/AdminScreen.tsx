import { type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { AccessSection } from '@/features/admin/AccessSection'
import { useAdmin } from '@/features/admin/adminContext'
import { CoverSearchSection } from '@/features/admin/CoverSearchSection'
import { CoversSection } from '@/features/admin/CoversSection'
import { HistorySection } from '@/features/admin/HistorySection'
import { StructureSection } from '@/features/admin/StructureSection'
import { TitlesSection } from '@/features/admin/TitlesSection'
import { useAuth } from '@/features/auth/authContext'
import { BigLinkButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'
import { Screen, ScreenTitle } from '@/ui/Screen'

interface Bereich {
  slug: string
  name: string
  /** Eine Zeile, die sagt, was drinsteckt – sonst rät man am Namen herum. */
  hinweis: string
  zeichen: string
  inhalt: (isAdmin: boolean) => ReactNode
}

const BEREICHE: Bereich[] = [
  {
    slug: 'zugaenge',
    name: 'Zugänge',
    hinweis: 'Wer die Hörbücher sehen darf',
    zeichen: '🔑',
    inhalt: () => <AccessSection />,
  },
  {
    slug: 'titel',
    name: 'Titel',
    hinweis: 'Namen richtigstellen, wo der Ordner danebenliegt',
    zeichen: '✎',
    inhalt: () => <TitlesSection />,
  },
  {
    slug: 'cover',
    name: 'Cover',
    hinweis: 'Für ein einzelnes Hörbuch ein Bild wählen oder suchen',
    zeichen: '🖼',
    inhalt: () => <CoversSection />,
  },
  {
    slug: 'cover-suche',
    name: 'Cover-Suche',
    hinweis: 'Auf einen Schlag für alle Hörbücher ohne Bild',
    zeichen: '🔎',
    inhalt: () => <CoverSearchSection />,
  },
  {
    slug: 'ordner',
    name: 'Ordner',
    hinweis: 'Ein Hörbuch – oder eines je Datei',
    zeichen: '📁',
    inhalt: () => <StructureSection />,
  },
  {
    slug: 'gehoert',
    name: 'Gehört',
    hinweis: 'Was zuletzt lief',
    zeichen: '📖',
    inhalt: (isAdmin) => <HistorySection enabled={isAdmin} />,
  },
]

/** Der Teil der Adresse hinter `/admin` – leer heisst: die Übersicht. */
function bereichAus(pathname: string): string {
  return pathname.replace(/^\/admin\/?/, '').replace(/\/$/, '')
}

/**
 * Der Adminbereich.
 *
 * Ein Stockwerk über dem Elternbereich: Der ist für alle, die das Tablet
 * verwalten, dieser für das eine Konto, das Zugänge freigibt und festlegt, wie
 * die Sammlung aussieht – Titel, Cover und der Zuschnitt der Ordner. Wer nicht
 * gemeint ist, bekommt hier nichts zu sehen – durchgesetzt wird das in den
 * Firestore-Regeln, nicht von diesem Bildschirm.
 *
 * Sechs Abschnitte standen bisher untereinander auf einer Seite. Jeder bringt
 * seinen Erklärtext, sein Suchfeld und seine Liste mit – zusammen war das ein
 * Bildschirm, an dem man vorbeiscrollte, um den einen zu finden, den man
 * suchte. Jetzt steht vorn eine Übersicht mit sechs Kacheln, und jeder
 * Abschnitt hat eine eigene Adresse: Der Zurück-Knopf des Geräts führt damit
 * dorthin zurück, wo man herkam.
 */
export function AdminScreen() {
  const { isAdmin, state } = useAuth()
  const { requests } = useAdmin()
  const { pathname } = useLocation()

  if (!isAdmin) {
    return (
      <Screen>
        <ScreenTitle>Adminbereich</ScreenTitle>
        <Notice>
          Dieser Bereich gehört dem Administratorkonto. Angemeldet ist gerade{' '}
          {state.status === 'ready' ? (state.user.email ?? 'ein anderes Konto') : 'niemand'}.
        </Notice>
        <div className="pt-6">
          <BigLinkButton to="/eltern" variant="secondary">
            Zurück zum Elternbereich
          </BigLinkButton>
        </div>
      </Screen>
    )
  }

  // Eine Adresse, die es nicht gibt, führt zur Übersicht statt auf eine leere
  // Seite: Hier landet niemand versehentlich ausser über ein altes Lesezeichen.
  const gewaehlt = BEREICHE.find((bereich) => bereich.slug === bereichAus(pathname))

  if (gewaehlt) {
    return (
      <Screen>
        <div className="py-4">
          <Link
            to="/admin"
            className="inline-flex min-h-touch items-center gap-2 rounded-tile pr-4 text-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span aria-hidden="true" className="text-3xl">
              ←
            </span>
            Adminbereich
          </Link>
        </div>

        {gewaehlt.inhalt(isAdmin)}
      </Screen>
    )
  }

  const offeneAnfragen = requests.filter((request) => request.status === 'pending').length

  return (
    <Screen>
      <ScreenTitle>Adminbereich</ScreenTitle>

      {/* Eine Spalte auf dem Telefon, zwei ab Tablet: Zwei Kacheln nebeneinander
          lassen auf 390px für den Hinweis darunter keine zwei Wörter übrig. */}
      <ul className="grid gap-4 sm:grid-cols-2">
        {BEREICHE.map((bereich) => (
          <li key={bereich.slug}>
            <Link
              to={`/admin/${bereich.slug}`}
              className="flex min-h-touch items-center gap-4 rounded-tile bg-surface p-4 transition-transform active:scale-[0.98] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span aria-hidden="true" className="text-3xl">
                {bereich.zeichen}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-xl font-semibold">
                  {bereich.name}
                  {/* Offene Anfragen sind das Einzige hier, was von selbst
                      auftaucht und wartet – ohne diese Zahl bliebe es
                      unbemerkt, bis jemand nachsieht. */}
                  {bereich.slug === 'zugaenge' && offeneAnfragen > 0
                    ? ` · ${String(offeneAnfragen)} offen`
                    : ''}
                </span>
                <span className="text-sm text-ink-soft">{bereich.hinweis}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="pt-8">
        <BigLinkButton to="/eltern" variant="secondary">
          Zurück zum Elternbereich
        </BigLinkButton>
      </div>
    </Screen>
  )
}
