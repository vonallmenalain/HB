import type { ReactNode } from 'react'

/**
 * Bildschirm-Grundgerüst. Kümmert sich um die sicheren Bereiche (Notch,
 * Gestenleiste) und um den seitlichen Rand, damit ihn nicht jede Seite selbst
 * setzen muss.
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
      }}
    >
      {children}
    </div>
  )
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <h1 className="py-6 text-3xl font-bold tracking-tight">{children}</h1>
}
