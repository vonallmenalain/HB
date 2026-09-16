import { useEffect, useState } from 'react'

/**
 * Wie lange die Rückfrage stehen bleibt, bevor sie von selbst verschwindet.
 *
 * Wer danebengetippt hat, tut nichts weiter – und findet die Kachel unverändert
 * vor, statt sich an einen Knopf zu erinnern, den er wegklicken muss.
 */
const ASK_TIMEOUT_MS = 5000

/**
 * Nimmt ein Hörbuch von „Weiterhören" – von der grossen Kachel wie von den
 * Kacheln im Abschnitt darunter.
 *
 * Zwei Tipps, nicht einer: Der erste fragt, der zweite entfernt. Für ein Kind
 * ist das kein Umweg, sondern der Unterschied zwischen „daneben getippt" und
 * „drei Stunden Hörbuch wieder von vorn" – denn entfernen heisst hier, die
 * Stelle zu vergessen.
 *
 * Bewusst ohne Text im Kasten: Im Kinderbereich gibt es laut Konzept keine
 * Meldungen. Das Kreuz wird zum Haken, und das versteht auch, wer noch nicht
 * liest.
 */
export function RemoveFromShelf({
  title,
  onRemove,
  className = '',
}: {
  /** Für die Vorlesehilfe: um welches Buch geht es? */
  title: string
  onRemove: () => void
  className?: string
}) {
  const [fragt, setFragt] = useState(false)

  useEffect(() => {
    if (!fragt) return
    const timer = setTimeout(() => {
      setFragt(false)
    }, ASK_TIMEOUT_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [fragt])

  return (
    <button
      type="button"
      aria-label={fragt ? `${title} wirklich entfernen` : `${title} entfernen`}
      // Die Fläche misst 64px – die Untergrenze aus KONZEPT §5.5 –, der
      // sichtbare Kreis bleibt kleiner. Andersherum, mit einem Ziel von der
      // Grösse des Kreises, landete jeder Fehlgriff auf der Kachel darunter
      // und startete das Hörbuch.
      className={`flex size-touch items-center justify-center rounded-full focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      onClick={() => {
        if (!fragt) {
          setFragt(true)
          return
        }
        setFragt(false)
        onRemove()
      }}
    >
      <span
        aria-hidden="true"
        className={`flex size-11 items-center justify-center rounded-full text-xl shadow transition-transform ${
          fragt ? 'bg-accent text-white' : 'bg-surface text-ink-soft'
        }`}
      >
        {fragt ? '✓' : '✕'}
      </span>
    </button>
  )
}
