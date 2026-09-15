import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Erzeugt eine echte WAV-Datei.
 *
 * Echte Audiodateien statt Attrappen: Nur so läuft der Scanner durch dieselbe
 * `music-metadata`-Auswertung wie im Betrieb, inklusive Dauerberechnung.
 */
export function wav(seconds: number, sampleRate = 8000): Buffer {
  const samples = Math.round(seconds * sampleRate)
  const dataBytes = samples * 2
  const buffer = Buffer.alloc(44 + dataBytes)

  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16) // Länge des fmt-Blocks
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28) // Bytes pro Sekunde
  buffer.writeUInt16LE(2, 32) // Blockausrichtung
  buffer.writeUInt16LE(16, 34) // Bits pro Sample
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataBytes, 40)

  // Ein leiser Sinuston – nicht nur Stille, damit die Datei auch im Browser
  // hörbar etwas tut.
  for (let i = 0; i < samples; i += 1) {
    const value = Math.round(Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 3000)
    buffer.writeInt16LE(value, 44 + i * 2)
  }
  return buffer
}

/** Kleinstes gültiges PNG (1×1, weiss) – als Cover-Datei. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

export interface FixtureFile {
  name: string
  seconds?: number
  content?: Buffer | string
}

export interface FixtureBook {
  path: string
  files: FixtureFile[]
}

/** Legt eine Hörbuch-Bibliothek in einem temporären Ordner an. */
export async function makeLibrary(books: FixtureBook[]): Promise<{
  mediaRoot: string
  cacheDir: string
}> {
  const base = await mkdtemp(join(tmpdir(), 'hb-fixture-'))
  const mediaRoot = join(base, 'media')
  const cacheDir = join(base, 'cache')
  await mkdir(mediaRoot, { recursive: true })
  await mkdir(cacheDir, { recursive: true })

  for (const book of books) {
    const folder = join(mediaRoot, book.path)
    await mkdir(folder, { recursive: true })
    for (const file of book.files) {
      const content = file.content ?? wav(file.seconds ?? 1)
      await writeFile(join(folder, file.name), content)
    }
  }

  return { mediaRoot, cacheDir }
}
