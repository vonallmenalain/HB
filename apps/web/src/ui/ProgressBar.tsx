/**
 * Fortschrittsbalken – bewusst nur Anzeige, nicht ziehbar.
 *
 * Kinder verlieren beim versehentlichen Wischen ihre Stelle, und genau das
 * soll diese App verhindern (Konzept §5.4). Gesprungen wird über Kapitel und
 * die ±30-Sekunden-Knöpfe.
 */
export function ProgressBar({
  ratio,
  label,
  className = '',
}: {
  ratio: number
  label: string
  className?: string
}) {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100)

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={`h-3 w-full overflow-hidden rounded-full bg-surface-sunken ${className}`}
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${String(percent)}%` }} />
    </div>
  )
}
