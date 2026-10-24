import type { ReactNode } from 'react'

/**
 * Symbole für die Knöpfe im Player.
 *
 * Als SVG und nicht als Schriftzeichen: ▶ und ⏸ sitzen je nach Schrift und
 * Gerät woanders – mal ein paar Pixel tiefer, mal als buntes Emoji mit eigenem
 * Kästchen. Ein Pfad in einem festen 24er-Raster sitzt überall gleich, und
 * die Mitte lässt sich nachrechnen statt erhoffen.
 *
 * Gezeichnet ist alles um den Punkt (12, 12). Die eine bewusste Ausnahme ist
 * das Dreieck, siehe {@link PlayIcon}.
 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      // `block`: Als Inline-Element sässe das SVG auf der Grundlinie, und die
      // Unterlänge darunter schöbe es ein Stück aus der Mitte.
      className="block size-full"
    >
      {children}
    </svg>
  )
}

/**
 * Abspielen.
 *
 * Mittig nach dem Rahmen gesetzt wirkt ein Dreieck nach links verrutscht – die
 * Spitze ist dünn, das Gewicht liegt an der flachen Seite. Deshalb liegt hier
 * der Schwerpunkt in der Mitte (x = 12), nicht der Rahmen: Das Auge misst
 * Fläche, nicht Kanten. Dieselbe Korrektur machen alle gängigen Player.
 */
export function PlayIcon() {
  return (
    <Icon>
      <path d="M8.75 5.5 18.5 12 8.75 18.5Z" strokeWidth={2} />
    </Icon>
  )
}

export function PauseIcon() {
  return (
    <Icon>
      <rect x="6.5" y="5" width="4" height="14" rx="1.25" stroke="none" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.25" stroke="none" />
    </Icon>
  )
}

export function StopIcon() {
  return (
    <Icon>
      <rect x="6" y="6" width="12" height="12" rx="2.5" stroke="none" />
    </Icon>
  )
}

export function PreviousIcon() {
  return (
    <Icon>
      <rect x="5.5" y="6" width="2.5" height="12" rx="1.25" stroke="none" />
      <path d="M17.5 7v10L10 12Z" strokeWidth={2} />
    </Icon>
  )
}

export function NextIcon() {
  return (
    <Icon>
      <rect x="16" y="6" width="2.5" height="12" rx="1.25" stroke="none" />
      <path d="M6.5 7v10L14 12Z" strokeWidth={2} />
    </Icon>
  )
}

/**
 * Kreispfeil mit der Sprungweite darin.
 *
 * Die Zahl steht im Symbol und nicht daneben: Sie sagt Eltern, wie weit der
 * Knopf springt, und braucht dafür keinen Platz, den es auf einem kleinen
 * Bildschirm nicht gibt.
 */
function SkipIcon({ seconds, forward }: { seconds: number; forward: boolean }) {
  return (
    <Icon>
      <g fill="none" strokeWidth={2}>
        {forward ? (
          <>
            <path d="M20.5 13A8.5 8.5 0 1 1 12 4.5" />
            <path d="M9.75 2.25 12 4.5 9.75 6.75" />
          </>
        ) : (
          <>
            <path d="M3.5 13A8.5 8.5 0 1 0 12 4.5" />
            <path d="M14.25 2.25 12 4.5 14.25 6.75" />
          </>
        )}
      </g>
      <text
        x="12"
        y="13.5"
        stroke="none"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="7"
        fontWeight="700"
      >
        {seconds}
      </text>
    </Icon>
  )
}

export function BackIcon({ seconds }: { seconds: number }) {
  return <SkipIcon seconds={seconds} forward={false} />
}

export function ForwardIcon({ seconds }: { seconds: number }) {
  return <SkipIcon seconds={seconds} forward />
}

export function CloseIcon() {
  return (
    <Icon>
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" strokeWidth={2.5} />
    </Icon>
  )
}
