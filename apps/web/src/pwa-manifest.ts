/**
 * Web-App-Manifest. Liegt bewusst als TypeScript-Datei vor, damit die
 * Vite-Konfiguration es importieren kann und es nur eine Quelle gibt.
 */
import type { ManifestOptions } from 'vite-plugin-pwa'

export const manifest: Partial<ManifestOptions> = {
  id: '/',
  name: 'Hörbücher',
  short_name: 'Hörbücher',
  description:
    'Hörbücher für Kinder – einfach auswählen, immer dort weiterhören, wo du aufgehört hast.',
  lang: 'de',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  /*
   * Echter Vollbildmodus: Ohne Adresszeile, ohne Statusleiste oben, ohne
   * Navigationsleiste unten. Auf einem Tablet in der Hand eines Kindes ist
   * jede davon eine Fläche, die aus der App herausführt.
   *
   * `display_override` nennt die Wunschliste in der Reihenfolge, in der sie
   * versucht wird; `display` bleibt als Rückfallebene für Browser stehen, die
   * die Liste noch nicht kennen.
   */
  display: 'fullscreen',
  display_override: ['fullscreen', 'standalone'],
  /*
   * Keine feste Ausrichtung mehr. Das Raster füllt jetzt die Breite, die da
   * ist – auf einem Tablet im Querformat sind das fünf Kacheln statt drei,
   * und eine erzwungene Hochkant-Ansicht nähme genau das wieder weg.
   */
  background_color: '#fbf7f0',
  theme_color: '#6d28d9',
  categories: ['entertainment', 'education'],
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}
