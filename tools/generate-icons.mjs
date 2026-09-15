/**
 * Erzeugt die App-Icons aus einer einzigen Quelle.
 *
 *   npm run icons
 *
 * Die PNGs werden committet, damit weder Netlify noch die CI `sharp` brauchen.
 * Nur wer das Icon ändert, führt dieses Skript aus.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'icons')

const BG_FROM = '#7c3aed'
const BG_TO = '#5b21b6'

/**
 * Kopfhörer, zentriert in einer 512er-Fläche. `scale` verkleinert die Marke um
 * ihren eigenen Mittelpunkt – für maskable-Icons muss sie in den inneren 80 %
 * bleiben, weil Android beliebig beschneidet.
 */
function glyph(scale) {
  return `
    <g transform="translate(256 256) scale(${scale}) translate(-256 -312)">
      <path d="M128 316a128 128 0 0 1 256 0" fill="none" stroke="#ffffff"
            stroke-width="44" stroke-linecap="round"/>
      <rect x="92" y="300" width="80" height="136" rx="40" fill="#ffffff"/>
      <rect x="340" y="300" width="80" height="136" rx="40" fill="#ffffff"/>
    </g>`
}

function svg({ radius, scale }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG_FROM}"/>
      <stop offset="1" stop-color="${BG_TO}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#bg)"/>
  ${glyph(scale)}
</svg>
`
}

// „any“: eigene abgerundete Ecken. „maskable“: randlos, Marke kleiner,
// damit sie jede Maske übersteht.
const source = svg({ radius: 112, scale: 0.78 })
const maskableSource = svg({ radius: 0, scale: 0.58 })

const targets = [
  { file: 'icon-192.png', source, size: 192 },
  { file: 'icon-512.png', source, size: 512 },
  { file: 'maskable-192.png', source: maskableSource, size: 192 },
  { file: 'maskable-512.png', source: maskableSource, size: 512 },
]

await mkdir(outDir, { recursive: true })
await writeFile(join(outDir, 'icon.svg'), source, 'utf8')

for (const { file, source: svgSource, size } of targets) {
  await sharp(Buffer.from(svgSource))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(outDir, file))
  console.log(`✓ ${file} (${size}×${size})`)
}
console.log(`✓ icon.svg`)
