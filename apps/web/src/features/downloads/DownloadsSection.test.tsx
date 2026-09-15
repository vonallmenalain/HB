import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LibraryContext } from '@/features/library/libraryContext'
import {
  makeBook,
  makeDownloadRecord,
  makeDownloadsValue,
  makeLibraryValue,
} from '@/test/renderWithProfiles'

import { DownloadsSection } from './DownloadsSection'
import { type DownloadsContextValue, DownloadsContext } from './downloadsContext'

function show(overrides: Partial<DownloadsContextValue> = {}) {
  return render(
    <LibraryContext value={makeLibraryValue({ books: [makeBook({ id: 'b_1' })] })}>
      <DownloadsContext value={makeDownloadsValue(overrides)}>
        <DownloadsSection />
      </DownloadsContext>
    </LibraryContext>,
  )
}

describe('Downloads im Elternbereich', () => {
  it('sagt, ob das Tablet gerade weggelegt werden darf', () => {
    // Die Frage, die sich beim Herunterladen wirklich stellt.
    show({ background: true, transfer: 'background' })

    expect(screen.getByText(/App darf dabei zu sein/)).toBeInTheDocument()
  })

  it('warnt, wenn der laufende Download die offene App braucht', () => {
    show({ background: true, transfer: 'foreground' })

    expect(screen.getByText(/Lass sie bitte offen/)).toBeInTheDocument()
  })

  it('listet jedes geladene Buch mit seiner Grösse', () => {
    show({
      records: new Map([['b_1', makeDownloadRecord({ bookId: 'b_1', bytesDone: 25_000_000 })]]),
    })

    expect(screen.getByText('Der Super-Papagei')).toBeInTheDocument()
    expect(screen.getByText('25 MB')).toBeInTheDocument()
  })

  it('zeigt gar nichts, wo sich nichts speichern lässt', () => {
    const { container } = show({ supported: false })

    expect(container).toBeEmptyDOMElement()
  })
})
