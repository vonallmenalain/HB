import { type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { useProfiles } from '@/features/profiles/profilesContext'
import { ManageProfilesScreen } from '@/features/profiles/ManageProfilesScreen'
import { ProfilePicker } from '@/features/profiles/ProfilePicker'
import { HomeScreen } from '@/routes/HomeScreen'
import { LibraryScreen } from '@/routes/LibraryScreen'
import { NotFoundScreen } from '@/routes/NotFoundScreen'
import { Screen } from '@/ui/Screen'
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
      <Route path="/profil" element={<ProfilePicker />} />
      <Route path="/eltern" element={<ManageProfilesScreen />} />
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  )
}
