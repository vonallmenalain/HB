import { Notice } from '@/ui/Notice'

import { useProgress } from './progressContext'

/**
 * Was der Abgleich gerade tut – nur für die Eltern.
 *
 * Ein funktionierender Abgleich ist unsichtbar, und das ist richtig so. Ein
 * *nicht* funktionierender wäre es auch – und genau das führt zu der Frage,
 * warum auf dem Tablet etwas anderes steht als auf dem Handy. Deshalb steht
 * hier eine Antwort, und zwar eine, die in jedem Fall beruhigt: Der Fortschritt
 * liegt immer zuerst auf dem Gerät. Verloren geht er nie.
 */
export function SyncNotice() {
  const { syncState } = useProgress()

  if (syncState === 'off') return null

  return (
    <section className="flex flex-col gap-4 pt-8">
      <h2 className="text-2xl font-bold">Hörfortschritt</h2>
      {syncState === 'error' ? (
        <Notice tone="error">
          Der Abgleich ist gerade nicht möglich. Der Hörfortschritt wird weiter auf diesem
          Gerät gespeichert und geht nicht verloren.
        </Notice>
      ) : (
        <Notice>
          {syncState === 'live'
            ? 'Der Hörfortschritt wird zwischen allen Geräten abgeglichen.'
            : 'Der Hörfortschritt ist auf diesem Gerät gespeichert. Sobald wieder Netz da ist, gleicht er sich mit den anderen Geräten ab.'}
        </Notice>
      )}
    </section>
  )
}
