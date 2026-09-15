import { type InputHTMLAttributes, useId } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string }

export function TextField({ label, className = '', ...props }: Props) {
  const id = useId()

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="pl-1 font-semibold text-ink-soft">
        {label}
      </label>
      <input
        id={id}
        className={
          'min-h-touch rounded-tile border-2 border-line bg-surface px-4 text-xl ' +
          'focus-visible:border-primary focus-visible:outline-4 focus-visible:outline-offset-1 ' +
          `focus-visible:outline-accent ${className}`
        }
        {...props}
      />
    </div>
  )
}
