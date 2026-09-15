/** Bildmarke der App – dieselbe Form wie das Startbildschirm-Symbol. */
export function HeadphonesMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className={className} fill="none">
      <path
        d="M128 316a128 128 0 0 1 256 0"
        stroke="currentColor"
        strokeWidth="44"
        strokeLinecap="round"
      />
      <rect x="92" y="300" width="80" height="136" rx="40" fill="currentColor" />
      <rect x="340" y="300" width="80" height="136" rx="40" fill="currentColor" />
    </svg>
  )
}
