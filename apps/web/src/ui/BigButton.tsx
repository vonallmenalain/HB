import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

const base =
  'flex min-h-touch w-full items-center justify-center gap-3 rounded-tile ' +
  'text-xl font-semibold transition-transform active:scale-[0.98] ' +
  'focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent'

/**
 * Der Innenabstand ist nicht dekorativ: Bei drei Knöpfen nebeneinander auf
 * einem 412px-Display bleibt sonst zu wenig Platz, und „10 Min" bricht um.
 * Die Mindesthöhe aus KONZEPT §5.5 bleibt in beiden Fällen dieselbe.
 */
const paddings = {
  normal: 'px-6',
  eng: 'px-2 whitespace-nowrap',
} as const

export type BigButtonPadding = keyof typeof paddings

const variants = {
  primary: 'bg-primary text-on-primary',
  secondary: 'bg-surface text-ink border-2 border-line',
} as const

export type BigButtonVariant = keyof typeof variants

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BigButtonVariant
  padding?: BigButtonPadding
  children: ReactNode
}

/**
 * Der Standard-Knopf der App. Mindestens 64px hoch – die verbindliche
 * Untergrenze für Touch-Ziele aus docs/KONZEPT.md §5.5.
 */
export function BigButton({
  variant = 'primary',
  padding = 'normal',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`${base} ${paddings[padding]} ${variants[variant]} ${className}`}
      {...props}
    />
  )
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
    <Link to={to} className={`${base} ${paddings.normal} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  )
}
