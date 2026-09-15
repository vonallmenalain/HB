import type { ReactNode } from 'react'

import { HeadphonesMark } from './HeadphonesMark'

/**
 * Leerer Zustand. Bewusst als Bild plus ein Satz, nicht als Fehlermeldung –
 * ein Kind soll daran nichts falsch machen können und nichts lesen müssen, um
 * zu verstehen, dass hier gerade nichts ist.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-tile bg-surface px-6 py-12 text-center">
      <HeadphonesMark className="h-24 w-24 text-line" />
      <p className="text-2xl font-semibold">{title}</p>
      {hint ? <p className="max-w-sm text-ink-soft">{hint}</p> : null}
      {action ? <div className="w-full max-w-sm pt-2">{action}</div> : null}
    </div>
  )
}
