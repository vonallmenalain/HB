import { summarizeByProfile, topBooks } from '@/features/history/history'
import { useListeningHistory } from '@/features/history/useListeningHistory'
import { formatTime } from '@/lib/format'
import { Notice } from '@/ui/Notice'
import { Spinner } from '@/ui/Spinner'

function datum(iso: string): string {
  if (iso === '') return 'unbekannt'
  const zeit = Date.parse(iso)
  if (Number.isNaN(zeit)) return 'unbekannt'
  return new Date(zeit).toLocaleDateString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function malGehoert(plays: number): string {
  return plays === 1 ? '1 Mal' : `${String(plays)} Mal`
}

/**
 * Wer hat was wie oft gehört.
 *
 * Aufgezeichnet wird beim Abspielen, je Profil und Buch: wie oft gestartet und
 * wie viele Sekunden tatsächlich gelaufen sind. Das beantwortet die Frage, die
 * sich zu Hause wirklich stellt – „läuft eigentlich immer nur dieselbe Folge?“
 * – ohne ein Protokoll über den Tag eines Kindes anzulegen.
 */
export function HistorySection({ enabled }: { enabled: boolean }) {
  const { loading, entries, error } = useListeningHistory(enabled)

  const profile = summarizeByProfile(entries)
  const beliebteste = topBooks(entries, 10)

  return (
    <section className="flex flex-col gap-4 pt-8">
      <h2 className="text-2xl font-bold">Gehört</h2>

      {error ? (
        <Notice tone="error">
          Die Hörhistorie lässt sich gerade nicht lesen – entweder fehlt die Verbindung, oder die
          Firestore-Regeln sind noch nicht deployt.
        </Notice>
      ) : null}

      {loading ? <Spinner label="Hörhistorie wird geladen" /> : null}

      {!loading && !error && entries.length === 0 ? (
        <Notice>Noch nichts aufgezeichnet. Sobald jemand hört, steht es hier.</Notice>
      ) : null}

      {profile.map((eintrag) => (
        <div
          key={`${eintrag.profileId}-${eintrag.profileName}`}
          className="flex flex-col gap-2 rounded-tile bg-surface p-4"
        >
          <div className="flex items-baseline gap-3">
            <h3 className="flex-1 text-xl font-semibold">{eintrag.profileName}</h3>
            <span className="text-ink-soft">{datum(eintrag.lastPlayedAt)}</span>
          </div>

          <p className="text-ink-soft">
            {malGehoert(eintrag.plays)} gestartet · {formatTime(eintrag.secondsListened)} gehört ·{' '}
            {eintrag.books} {eintrag.books === 1 ? 'Hörbuch' : 'Hörbücher'}
          </p>

          <ol className="flex flex-col gap-1 pt-2">
            {eintrag.top.map((buch) => (
              <li key={buch.id} className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate">{buch.bookTitle}</span>
                <span className="shrink-0 tabular-nums text-ink-soft">
                  {malGehoert(buch.plays)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}

      {beliebteste.length > 0 ? (
        <details className="rounded-tile bg-surface-sunken p-4">
          <summary className="min-h-touch cursor-pointer font-semibold">
            Meistgehört über alle Profile
          </summary>
          <ol className="flex flex-col gap-1 pt-3">
            {beliebteste.map((buch) => (
              <li key={buch.id} className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate">{buch.bookTitle}</span>
                <span className="shrink-0 text-ink-soft">{buch.profileName}</span>
                <span className="shrink-0 tabular-nums text-ink-soft">
                  {malGehoert(buch.plays)}
                </span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  )
}
