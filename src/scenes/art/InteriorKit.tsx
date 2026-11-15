import { useId, useMemo } from 'react'
import { LOCATIONS } from '../../data/locations'
import { useWorldStore } from '../../stores/worldStore'
import type { LocationId } from '../../types'
import { fmtTime } from '../../utils/math'
import { Landmark } from './Landmarks'
import { Building, Clouds, Stars } from './primitives'

/** Окно с видом на улицу «якорной» локации. Небо живое (CSS-переменные освещения). */
export function WindowView({ x, y, w, h, anchor, frame = '#3a2f45', mullions = 2, scale = 0.55, rows = true }: {
  x: number; y: number; w: number; h: number; anchor: LocationId; frame?: string; mullions?: number; scale?: number; rows?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const theme = LOCATIONS[anchor].theme
  const k = scale * (w / 600)
  const baseU = (h / k) * 0.8
  const row = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => (
        <Building key={i} x={-60 + i * 150} w={110 + (i % 3) * 30} h={150 + ((i * 53) % 160)} y={baseU} color={theme.wall[i % theme.wall.length]} seed={i + 5} haze={0.5} lit={0.35} snow={false} />
      )),
    [theme, baseU],
  )
  return (
    <g>
      <clipPath id={`win-${id}`}>
        <rect x={x} y={y} width={w} height={h} rx="3" />
      </clipPath>
      <g clipPath={`url(#win-${id})`}>
        <rect x={x} y={y} width={w} height={h} fill="url(#sky)" />
        <g transform={`translate(${x} ${y}) scale(${k} ${k})`}>
          <Stars count={30} />
          <Clouds count={3} y={20} scale={0.6} />
          {rows && row}
          <Landmark theme={theme} baseY={baseU} haze={0.4} />
          <rect x="-100" y={baseU} width="2200" height="400" fill={theme.groundBottom} />
          <rect x="-100" y={baseU} width="2200" height="14" fill={theme.groundTop} />
        </g>
        <rect x={x} y={y} width={w} height={h} fill="url(#fade-bottom)" opacity=".1" />
        {/* блик */}
        <path d={`M${x + w * 0.1} ${y + h} L${x + w * 0.35} ${y} L${x + w * 0.45} ${y} L${x + w * 0.2} ${y + h} Z`} fill="#fff" opacity=".06" />
      </g>
      <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12} rx="6" fill="none" stroke={frame} strokeWidth="12" />
      {Array.from({ length: mullions }, (_, i) => (
        <rect key={i} x={x + ((i + 1) * w) / (mullions + 1) - 3} y={y} width="6" height={h} fill={frame} />
      ))}
      <rect x={x} y={y + h * 0.52} width={w} height="5" fill={frame} />
    </g>
  )
}

/** Подвесная лампа: латунный плафон с бликом, тёплое нутро, лампочка. */
export function PendantLamp({ x, y, len = 120, color = '#ffb870' }: { x: number; y: number; len?: number; color?: string }) {
  const b = y + len
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={b - 6} stroke="#1f1b26" strokeWidth="2" />
      <rect x={x - 5} y={b - 8} width="10" height="10" rx="2" fill="url(#brass-v)" />
      <path d={`M${x - 30} ${b + 24} Q${x - 26} ${b} ${x} ${b} Q${x + 26} ${b} ${x + 30} ${b + 24} Z`} fill="url(#brass-v)" />
      <path d={`M${x - 30} ${b + 24} Q${x - 26} ${b} ${x} ${b} Q${x + 26} ${b} ${x + 30} ${b + 24} Z`} fill="url(#shade-y)" opacity=".6" />
      <ellipse cx={x} cy={b + 24} rx="30" ry="5" fill={color} />
      <ellipse cx={x} cy={b + 25} rx="12" ry="3.4" fill="#fff6dc" className="lamp-lit" />
    </g>
  )
}

export function PendantGlow({ x, y, len = 120, r = 170 }: { x: number; y: number; len?: number; r?: number }) {
  return <circle cx={x} cy={y + len + 24} r={r} fill="url(#glow-warm)" style={{ mixBlendMode: 'screen' }} opacity=".65" />
}

/** Комнатное растение: керамический горшок с бликом, листья разных тонов (покачиваются). */
export function Plant({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="2" cy="1" rx="24" ry="4" fill="url(#contact)" />
      {[-40, -22, -6, 10, 26, 42].map((a, i) => (
        <g key={i} className="sway" style={{ ['--sway' as string]: '2deg', ['--sway-dur' as string]: `${3 + i * 0.4}s` }}>
          <path d={`M0 -34 Q${a * 1.3} -76 ${a * 2} ${-62 - (i % 3) * 14}`} stroke="#3b6e3a" strokeWidth="2.4" fill="none" />
          <path d={`M${a * 2} ${-62 - (i % 3) * 14} q${-a * 0.5 - 8} 4 ${-a * 0.9} 22 q${a * 0.5 + 6} -2 ${a * 0.9} -22 Z`} fill={['#4f8f4a', '#3f7a40', '#6aa65a'][i % 3]} />
        </g>
      ))}
      <path d="M-18 0 L-14 -34 H14 L18 0 Z" fill="#c9784a" />
      <path d="M-18 0 L-14 -34 H14 L18 0 Z" fill="url(#shade-x)" />
      <rect x="-16" y="-38" width="32" height="7" rx="2" fill="#b0643c" />
    </g>
  )
}

/** Настенные часы показывают игровое время (обновляются раз в несколько минут). */
export function WallClock({ x, y, r = 30 }: { x: number; y: number; r?: number }) {
  const m = useWorldStore((s) => Math.floor(s.minutes / 3) * 3)
  const mm = m % 60
  const hh = (m / 60) % 12
  const ha = (hh + mm / 60) * 30 - 90
  const ma = mm * 6 - 90
  const rad = (a: number) => (a * Math.PI) / 180
  return (
    <g>
      <circle cx={x + 3} cy={y + 4} r={r + 3} fill="url(#contact)" opacity=".7" />
      <circle cx={x} cy={y} r={r} fill="#f4ecdc" stroke="#3a2f45" strokeWidth="4" />
      <circle cx={x} cy={y} r={r} fill="url(#shade-y)" opacity=".5" />
      {Array.from({ length: 12 }, (_, i) => <line key={i} x1={x + Math.cos((i * Math.PI) / 6) * r * 0.84} y1={y + Math.sin((i * Math.PI) / 6) * r * 0.84} x2={x + Math.cos((i * Math.PI) / 6) * r * 0.94} y2={y + Math.sin((i * Math.PI) / 6) * r * 0.94} stroke="#3a2f45" strokeWidth={i % 3 ? 1 : 2} />)}
      <line x1={x} y1={y} x2={x + Math.cos(rad(ha)) * r * 0.5} y2={y + Math.sin(rad(ha)) * r * 0.5} stroke="#2a2430" strokeWidth="3" strokeLinecap="round" />
      <line x1={x} y1={y} x2={x + Math.cos(rad(ma)) * r * 0.78} y2={y + Math.sin(rad(ma)) * r * 0.78} stroke="#2a2430" strokeWidth="2" strokeLinecap="round" />
      <circle cx={x} cy={y} r="2.5" fill="#e0526a" />
      <title>{fmtTime(m)}</title>
    </g>
  )
}

export function Steam({ x, y, n = 3 }: { x: number; y: number; n?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${x + i * 6 - 6} ${y} q-6 -10 0 -18`} stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0" style={{ animation: `steam 2.8s ${i * 0.7}s ease-out infinite` }} />
      ))}
    </g>
  )
}
