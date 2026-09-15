import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { HomeScreen } from '@/routes/HomeScreen'
import { LibraryScreen } from '@/routes/LibraryScreen'
import { NotFoundScreen } from '@/routes/NotFoundScreen'

import { InstallButton } from './InstallButton'
import { UpdateBar } from './UpdateBar'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/bibliothek" element={<LibraryScreen />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
      <div className="mx-auto w-full max-w-2xl px-4">
        <InstallButton />
      </div>
      <UpdateBar />
    </BrowserRouter>
  )
}
