import type { ReactNode } from 'react'

/**
 * Knopf im Player.
 *
 * Die Grössen sind nicht frei gewählt: 112px für Play/Pause und 64px für die
 * übrigen stehen so im Konzept (§5.5). Ein Kind trifft damit auch im Halbdunkel
 * und ohne hinzusehen.
 */
export function PlayerButton({
  label,
  size = 'md',
  onClick,
  disabled = false,
  children,
}: {
  label: string
  size?: 'md' | 'lg'
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  const sizes = {
    md: 'size-touch text-3xl bg-surface text-ink',
    lg: 'size-touch-lg text-5xl bg-primary text-on-primary',
  } as const

  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-40 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent ${sizes[size]}`}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
}
