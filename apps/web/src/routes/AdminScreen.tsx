import { AccessSection } from '@/features/admin/AccessSection'
import { CoverSearchSection } from '@/features/admin/CoverSearchSection'
import { CoversSection } from '@/features/admin/CoversSection'
import { HistorySection } from '@/features/admin/HistorySection'
import { StructureSection } from '@/features/admin/StructureSection'
import { TitlesSection } from '@/features/admin/TitlesSection'
import { useAuth } from '@/features/auth/authContext'
import { BigLinkButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'
import { Screen, ScreenTitle } from '@/ui/Screen'

/**
 * Der Adminbereich.
 *
 * Ein Stockwerk über dem Elternbereich: Der ist für alle, die das Tablet
 * verwalten, dieser für das eine Konto, das Zugänge freigibt und festlegt, wie
 * die Sammlung aussieht – Titel, Cover und der Zuschnitt der Ordner. Wer nicht
 * gemeint ist, bekommt hier nichts zu sehen – durchgesetzt wird das in den
 * Firestore-Regeln, nicht von diesem Bildschirm.
 */
export function AdminScreen() {
  const { isAdmin, state } = useAuth()

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

  return (
    <Screen>
      <ScreenTitle>Adminbereich</ScreenTitle>

      <AccessSection />
      <TitlesSection />
      <CoverSearchSection />
      <CoversSection />
      <StructureSection />
      <HistorySection enabled={isAdmin} />

      <div className="pt-8">
        <BigLinkButton to="/eltern" variant="secondary">
          Zurück zum Elternbereich
        </BigLinkButton>
      </div>
    </Screen>
  )
}
