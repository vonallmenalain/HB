import type { ReactNode } from 'react'

/**
 * Bildschirm-Grundgerüst. Kümmert sich um die sicheren Bereiche (Notch,
 * Gestenleiste) und um den seitlichen Rand, damit ihn nicht jede Seite selbst
 * setzen muss.
 *
 * `wide` ist für die Seiten mit dem Kachelraster. Sonst gilt überall dieselbe
 * Lesebreite: Fliesstext und Knopfleisten über einen ganzen Bildschirm gezogen
 * sind schwerer zu lesen, nicht leichter. Ein Raster ist das Gegenteil – auf
 * einem Tablet im Querformat bliebe daneben die halbe Seite leer.
 */
export function Screen({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={`mx-auto flex min-h-dvh w-full flex-col px-4 ${
        wide ? 'max-w-2xl md:max-w-5xl' : 'max-w-2xl'
      }`}
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
