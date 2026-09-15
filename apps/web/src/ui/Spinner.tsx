/**
 * Ladeanzeige. Hat eine Textbeschriftung für Screenreader – ein sich drehender
 * Kreis allein sagt niemandem, worauf gewartet wird.
 */
export function Spinner({ label = 'Wird geladen' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-8">
      <span
        aria-hidden="true"
        className="size-6 animate-spin rounded-full border-3 border-line border-t-primary"
      />
      <span className="text-ink-soft">{label}</span>
    </div>
  )
}
