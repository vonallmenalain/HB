import { type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { useProfiles } from '@/features/profiles/profilesContext'
import { PinGate } from '@/features/parents/PinGate'
import { EditProfileScreen } from '@/features/profiles/EditProfileScreen'
import { ManageProfilesScreen } from '@/features/profiles/ManageProfilesScreen'
import { ProfilePicker } from '@/features/profiles/ProfilePicker'
import { AdminScreen } from '@/routes/AdminScreen'
import { BookScreen } from '@/routes/BookScreen'
import { HomeScreen } from '@/routes/HomeScreen'
import { LibraryScreen } from '@/routes/LibraryScreen'
import { NotFoundScreen } from '@/routes/NotFoundScreen'
import { PlayerScreen } from '@/routes/PlayerScreen'
import { SeriesScreen } from '@/routes/SeriesScreen'
import { Screen } from '@/ui/Screen'

import { useRememberView } from './useRememberView'
import { Spinner } from '@/ui/Spinner'

/**
 * Ohne gewähltes Profil gibt es keine Bücher – sonst wüsste die App nicht, wem
 * sie den Fortschritt zuschreiben soll.
 */
function RequireProfile({ children }: { children: ReactNode }) {
  const { loading, selected } = useProfiles()

  if (loading) {
    return (
      <Screen>
        <Spinner label="Profile werden geladen" />
      </Screen>
    )
  }
  if (!selected) return <Navigate to="/profil" replace />
  return children
}

export function AppRoutes() {
  useRememberView()

  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireProfile>
            <HomeScreen />
          </RequireProfile>
        }
      />
      <Route
        path="/bibliothek"
        element={
          <RequireProfile>
            <LibraryScreen />
          </RequireProfile>
        }
      />
      <Route
        path="/bibliothek/:slug"
        element={
          <RequireProfile>
            <SeriesScreen />
          </RequireProfile>
        }
      />
      <Route
        path="/buch/:bookId"
        element={
          <RequireProfile>
            <BookScreen />
          </RequireProfile>
        }
      />
      <Route
        path="/player/:bookId"
        element={
          <RequireProfile>
            <PlayerScreen />
          </RequireProfile>
        }
      />
      <Route path="/profil" element={<ProfilePicker />} />
      <Route path="/profil/bearbeiten" element={<EditProfileScreen />} />
      <Route
        path="/eltern"
        element={
          <PinGate>
            <ManageProfilesScreen />
          </PinGate>
        }
      />
      {/* Der Adminbereich liegt hinter derselben PIN – und zusätzlich hinter
          der Adresse, die in den Firestore-Regeln steht. */}
      {/* `/*`, damit auch die einzelnen Abschnitte (`/admin/titel`) hier
          landen: Jeder bekommt eine eigene Adresse, damit der Zurück-Knopf des
          Geräts zur Übersicht führt und nicht aus dem Adminbereich hinaus. */}
      <Route
        path="/admin/*"
        element={
          <PinGate>
            <AdminScreen />
          </PinGate>
        }
      />
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  )
}
