import { useState } from 'react'

import { coverLetter } from '@/features/library/catalog'

/**
 * Cover eines Hörbuchs.
 *
 * Ohne Bild – und wenn das Laden scheitert – erscheint eine farbige Kachel mit
 * dem Anfangsbuchstaben statt eines leeren grauen Rechtecks. Das Cover trägt
 * die Wiedererkennung für Kinder, die noch nicht lesen; irgendetwas muss dort
 * immer zu sehen sein.
 */
export function BookCover({
  title,
  color,
  src,
  className = '',
}: {
  title: string
  color: string
  src: string | null
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const letter = coverLetter(title)

  if (src === null || failed) {
    return (
      <div
        style={{ backgroundColor: color }}
        className={`flex aspect-square w-full items-center justify-center rounded-tile text-white ${className}`}
      >
        <span aria-hidden="true" className="text-6xl font-bold">
          {letter}
        </span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      style={{ backgroundColor: color }}
      onError={() => {
        setFailed(true)
      }}
      className={`aspect-square w-full rounded-tile object-cover ${className}`}
    />
  )
}
