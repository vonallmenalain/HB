import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

const base =
  'flex min-h-touch w-full items-center justify-center gap-3 rounded-tile px-6 ' +
  'text-xl font-semibold transition-transform active:scale-[0.98] ' +
  'focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent'

const variants = {
  primary: 'bg-primary text-on-primary',
  secondary: 'bg-surface text-ink border-2 border-line',
} as const

export type BigButtonVariant = keyof typeof variants

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BigButtonVariant
  children: ReactNode
}

/**
 * Der Standard-Knopf der App. Mindestens 64px hoch – die verbindliche
 * Untergrenze für Touch-Ziele aus docs/KONZEPT.md §5.5.
 */
export function BigButton({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <button type="button" className={`${base} ${variants[variant]} ${className}`} {...props} />
}

export function BigLinkButton({
  to,
  variant = 'primary',
  className = '',
  children,
}: {
  to: string
  variant?: BigButtonVariant
  className?: string
  children: ReactNode
}) {
  return (
    <Link to={to} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  )
}
