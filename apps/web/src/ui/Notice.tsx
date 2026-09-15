import type { ReactNode } from 'react'

/**
 * Hinweis- und Fehlerkasten. Nur im Elternbereich – im Kinderbereich gibt es
 * laut Konzept keine Textmeldungen.
 */
export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error'
  children: ReactNode
}) {
  const tones = {
    info: 'border-line bg-surface-sunken',
    error: 'border-accent bg-surface',
  } as const

  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={`rounded-tile border-2 px-4 py-3 ${tones[tone]}`}
    >
      {children}
    </div>
  )
}
