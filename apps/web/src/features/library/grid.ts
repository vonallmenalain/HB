/**
 * Das Kachelraster der Bibliothek.
 *
 * An einer Stelle, weil vier Ansichten dasselbe Raster zeigen – Startseite,
 * „Alle Hörbücher", eine Reihe und die Regale oben auf der Startseite. Vier
 * Abschriften hiessen: Beim nächsten Mal wird nur eine davon geändert.
 *
 * Ab `sm` legt der Browser selbst fest, wie viele Kacheln nebeneinander
 * passen; vorgegeben ist nur ihre kleinste Breite. Feste drei Spalten liessen
 * auf einem Tablet im Querformat die halbe Seite leer, und jede Breite
 * einzeln aufzuzählen hiesse, an das nächste Gerät nicht gedacht zu haben.
 * Auf dem Telefon bleiben es zwei feste Spalten: Bei sehr schmalen Geräten
 * käme das Raster sonst auf eine einzige.
 */
export const TILE_GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]'
