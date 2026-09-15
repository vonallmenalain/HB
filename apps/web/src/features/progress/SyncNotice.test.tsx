import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { makeProgressValue } from '@/test/renderWithProfiles'

import { SyncNotice } from './SyncNotice'
import { ProgressContext, type SyncState } from './progressContext'

function show(syncState: SyncState) {
  return render(
    <ProgressContext value={makeProgressValue({ syncState })}>
      <SyncNotice />
    </ProgressContext>,
  )
}

describe('SyncNotice', () => {
  it('sagt, dass abgeglichen wird', () => {
    show('live')

    expect(screen.getByText(/zwischen allen Geräten abgeglichen/)).toBeInTheDocument()
  })

  it('beruhigt, solange noch kein Abgleich stattgefunden hat', () => {
    show('connecting')

    expect(screen.getByText(/auf diesem Gerät gespeichert/)).toBeInTheDocument()
  })

  it('erklärt einen gescheiterten Abgleich, ohne Angst zu machen', () => {
    // Die Sorge der Eltern ist nicht „der Abgleich klemmt", sondern „ist der
    // Fortschritt weg". Darauf muss die Meldung antworten.
    show('error')

    expect(screen.getByRole('alert')).toHaveTextContent('geht nicht verloren')
  })

  it('zeigt ohne Cloud gar nichts', () => {
    const { container } = show('off')

    expect(container).toBeEmptyDOMElement()
  })
})
