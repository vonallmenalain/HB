/**
 * Kein Zoomen mit zwei Fingern.
 *
 * Gezoomt ragte der Player über den Rand: Der Play-Knopf lag ausserhalb, und
 * ein Kind wusste nicht, wie es zurückkommt. Die App hat grosse Schrift und
 * grosse Knöpfe – vergrössern muss hier niemand etwas.
 *
 * Drei Schichten, weil jeder Browser auf eine andere hört:
 * - `user-scalable=no` im Viewport (index.html) – Chrome auf Android.
 * - `touch-action: pan-x pan-y` auf `html` (index.css) – alle neueren Browser.
 * - Diese Funktion für Safari auf iPad und iPhone. Dort gilt der Viewport-
 *   Eintrag seit iOS 10 nicht mehr; die Geste selbst lässt sich aber noch
 *   abfangen. `gesture*` gibt es nur in WebKit, anderswo bleibt das wirkungslos.
 *
 * Gibt eine Funktion zurück, die die Sperre wieder aufhebt – für die Tests.
 */
export function preventPinchZoom(target: Document = document): () => void {
  const block = (event: Event): void => {
    event.preventDefault()
  }

  const events = ['gesturestart', 'gesturechange', 'gestureend'] as const
  for (const name of events) {
    target.addEventListener(name, block, { passive: false })
  }

  return () => {
    for (const name of events) target.removeEventListener(name, block)
  }
}
