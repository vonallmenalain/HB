import { BrowserRouter } from 'react-router-dom'

import { AdminProvider } from '@/features/admin/AdminProvider'
import { AccessPendingScreen } from '@/features/auth/AccessPendingScreen'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ConfigMissingScreen } from '@/features/auth/ConfigMissingScreen'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { useAuth } from '@/features/auth/authContext'
import { DownloadProvider } from '@/features/downloads/DownloadProvider'
import { FavoriteProvider } from '@/features/favorites/FavoriteProvider'
import { HistoryProvider } from '@/features/history/HistoryProvider'
import { ParentProvider } from '@/features/parents/ParentProvider'
import { LibraryProvider } from '@/features/library/LibraryProvider'
import { TitleProvider } from '@/features/library/TitleProvider'
import { NowPlayingBar } from '@/features/player/NowPlayingBar'
import { PlayerProvider } from '@/features/player/PlayerProvider'
import { ProgressProvider } from '@/features/progress/ProgressProvider'
import { ProfileProvider } from '@/features/profiles/ProfileProvider'
import { Screen } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'

import { AppRoutes } from './AppRoutes'
import { InstallButton } from './InstallButton'
import { UpdateBar } from './UpdateBar'

/**
 * Entscheidet anhand des Anmeldezustands, was überhaupt gezeigt wird.
 *
 * `denied` ist hier kein Sonderfall, sondern der erwartete Zustand für jedes
 * Konto ausserhalb der Familie: Anmelden darf sich jeder, Zugriff bekommt nur,
 * wer in der Freigabeliste steht.
 */
function AuthGate() {
  const { state } = useAuth()

  switch (state.status) {
    case 'config-missing':
      return <ConfigMissingScreen missing={state.missing} />
    case 'loading':
      return (
        <Screen>
          <Spinner label="Einen Moment" />
        </Screen>
      )
    case 'signed-out':
      return <LoginScreen />
    case 'denied':
      return (
        <AccessPendingScreen
          uid={state.user.uid}
          email={state.user.email}
          requested={state.requested}
        />
      )
    case 'ready':
      // Die Reihenfolge ist keine Geschmacksfrage: Die Bibliothek braucht die
      // von Hand gesetzten Titel, der Player den Aufzeichner, und beide
      // brauchen das aktive Profil.
      return (
        <ParentProvider>
          <ProfileProvider>
            <AdminProvider>
              <TitleProvider>
                <LibraryProvider>
                  <ProgressProvider>
                    <FavoriteProvider>
                      <HistoryProvider>
                        <DownloadProvider>
                          <PlayerProvider>
                            <AppRoutes />
                            <NowPlayingBar />
                          </PlayerProvider>
                        </DownloadProvider>
                      </HistoryProvider>
                    </FavoriteProvider>
                  </ProgressProvider>
                </LibraryProvider>
              </TitleProvider>
            </AdminProvider>
          </ProfileProvider>
        </ParentProvider>
      )
  }
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AuthGate />
        <div className="mx-auto w-full max-w-2xl px-4">
          <InstallButton />
        </div>
        <UpdateBar />
      </BrowserRouter>
    </AuthProvider>
  )
}
