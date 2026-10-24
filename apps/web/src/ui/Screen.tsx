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
 *
 * `fit` ist für den Player: genau so hoch wie der Bildschirm, nie höher. Die
 * Seite muss dann selbst dafür sorgen, dass ihr Inhalt hineinpasst – gescrollt
 * wird nicht.
 */
export function Screen({
  children,
  wide = false,
  fit = false,
}: {
  children: ReactNode
  wide?: boolean
  fit?: boolean
}) {
  return (
    <div
      className={`mx-auto flex w-full flex-col ${fit ? 'h-dvh overflow-hidden' : 'min-h-dvh'} ${
        wide ? 'max-w-2xl md:max-w-5xl' : 'max-w-2xl'
      }`}
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        // Auf niedrigen Bildschirmen zählt jeder Pixel; der Rand unten
        // schrumpft dort mit, statt einem Knopf den Platz wegzunehmen.
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${fit ? 'min(1.5rem, 3dvh)' : '1.5rem'})`,
        // Seitlich ebenso: Im Querformat liegt bei Handys mit Notch sonst der
        // Rand der Seite unter der Kamera.
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
      }}
    >
      {children}
    </div>
  )
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <h1 className="py-6 text-3xl font-bold tracking-tight">{children}</h1>
}
