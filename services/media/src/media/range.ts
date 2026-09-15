/**
 * Auswertung des `Range`-Headers.
 *
 * Ohne funktionierende Bereichsabfragen kann im Player nicht gesprungen
 * werden, und viele Browser starten die Wiedergabe gar nicht erst. Die
 * Unterscheidung zwischen „kaputter Header“ und „unerfüllbarer Bereich“ ist
 * dabei nicht kosmetisch: RFC 9110 verlangt, einen syntaktisch ungültigen
 * Header zu **ignorieren** (also 200 mit der ganzen Datei), einen gültigen
 * aber unerfüllbaren dagegen mit **416** zu beantworten.
 */
export type RangeResult =
  | { kind: 'full' }
  /** `start` und `end` sind beide einschliesslich. */
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable' }

const BYTES_PREFIX = 'bytes='

export function parseRange(header: string | undefined, size: number): RangeResult {
  if (header === undefined) return { kind: 'full' }

  const value = header.trim()
  if (!value.toLowerCase().startsWith(BYTES_PREFIX)) return { kind: 'full' }

  const spec = value.slice(BYTES_PREFIX.length).trim()
  if (spec === '') return { kind: 'full' }

  // Mehrere Bereiche sind erlaubt, aber selten und aufwendig (multipart).
  // Ein Server darf den Header ignorieren und die ganze Datei schicken.
  if (spec.includes(',')) return { kind: 'full' }

  const match = /^(\d*)-(\d*)$/.exec(spec)
  if (!match) return { kind: 'full' }

  const [, rawStart = '', rawEnd = ''] = match

  // "bytes=-" ist weder Anfang noch Suffix – syntaktisch unbrauchbar.
  if (rawStart === '' && rawEnd === '') return { kind: 'full' }

  if (rawStart === '') {
    // Suffix-Form: die letzten N Bytes.
    const suffixLength = Number(rawEnd)
    if (suffixLength === 0) return { kind: 'unsatisfiable' }
    if (size === 0) return { kind: 'unsatisfiable' }
    const start = Math.max(0, size - suffixLength)
    return { kind: 'partial', start, end: size - 1 }
  }

  const start = Number(rawStart)
  if (size === 0 || start >= size) return { kind: 'unsatisfiable' }

  if (rawEnd === '') return { kind: 'partial', start, end: size - 1 }

  const end = Number(rawEnd)
  if (end < start) return { kind: 'unsatisfiable' }

  // Ein zu grosses Ende wird auf das Dateiende gekürzt, nicht abgelehnt.
  return { kind: 'partial', start, end: Math.min(end, size - 1) }
}

/** Wert für den `Content-Range`-Header einer Teilantwort. */
export function contentRange(start: number, end: number, size: number): string {
  return `bytes ${start}-${end}/${size}`
}

/** Wert für den `Content-Range`-Header einer 416-Antwort. */
export function unsatisfiedContentRange(size: number): string {
  return `bytes */${size}`
}
