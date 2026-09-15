/** Rundes Profilbild – ein Emoji oder ein Buchstabe auf farbigem Grund. */
export function Avatar({
  avatar,
  color,
  size = 'md',
}: {
  avatar: string
  color: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizes = {
    sm: 'size-touch text-3xl',
    md: 'size-24 text-5xl',
    lg: 'size-32 text-6xl',
  } as const

  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className={`flex shrink-0 items-center justify-center rounded-full text-white ${sizes[size]}`}
    >
      {avatar}
    </span>
  )
}
