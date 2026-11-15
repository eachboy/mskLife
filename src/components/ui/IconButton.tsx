import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function IconButton({ label, active, children, size = 'md', className = '', ...rest }: Props) {
  const dim = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`${dim} grid shrink-0 place-items-center rounded-full transition-all duration-200 hover:bg-white/12 active:scale-95 ${
        active ? 'bg-[#ffb27a]/25 text-[#ffd6b0]' : 'text-[#fff3e2]/85'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
