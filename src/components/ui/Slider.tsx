interface Props {
  value: number
  onChange: (v: number) => void
  label: string
  disabled?: boolean
  className?: string
}

export function Slider({ value, onChange, label, disabled, className = '' }: Props) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      value={Math.round(value * 100)}
      aria-label={label}
      title={`${label}: ${Math.round(value * 100)}%`}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      className={`vol w-full min-w-[64px] ${disabled ? 'opacity-40' : ''} ${className}`}
      style={{ ['--v' as string]: `${value * 100}%` }}
    />
  )
}
