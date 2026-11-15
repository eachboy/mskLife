import { memo } from 'react'
import { mulberry32 } from '../../utils/math'

const IRON = '#24262c'
const SNOW = '#f2f5fc'

/** Светофор: корпус с козырьками, три секции + пешеходная; цикл сигналов — CSS (40 с). */
export const TrafficLight = memo(function TrafficLight({ x, y, s = 1, flip }: { x: number; y: number; s?: number; flip?: boolean }) {
  const lamp = (cy: number, c: string, cls: string) => (
    <g>
      <circle cx="0" cy={cy} r="7" fill="#15151a" />
      <circle cx="0" cy={cy} r="6" fill={c} className={cls} />
      <path d={`M-9 ${cy - 8} Q0 ${cy - 13} 9 ${cy - 8} L9 ${cy - 5} Q0 ${cy - 9} -9 ${cy - 5} Z`} fill={IRON} />
    </g>
  )
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <ellipse cx="2" cy="1" rx="14" ry="3" fill="url(#contact)" />
      <rect x="-3" y="-170" width="6" height="170" fill="url(#dark-metal-v)" />
      <rect x="-5" y="-14" width="10" height="14" rx="2" fill={IRON} />
      {/* полосатая «зебра» на столбе */}
      <rect x="-3.5" y="-60" width="7" height="34" fill="url(#pat-stripes)" opacity=".5" />
      <g transform="translate(14 -200)">
        <rect x="-11" y="-30" width="22" height="66" rx="4" fill="#2a2c34" />
        <rect x="-11" y="-30" width="22" height="66" rx="4" fill="url(#shade-x)" />
        {lamp(-18, '#ff3b30', 'tl-red')}
        {lamp(2, '#ffc22a', 'tl-yellow')}
        {lamp(22, '#2fe07a', 'tl-green')}
      </g>
      <path d="M3 -190 H14" stroke={IRON} strokeWidth="3" />
      {/* пешеходный: человечек */}
      <g transform="translate(-14 -120)">
        <rect x="-9" y="-22" width="18" height="40" rx="3" fill="#2a2c34" />
        <path d="M0 -15 a2.4 2.4 0 1 1 0.01 0 M-1 -11 v8 l-3 7 M-1 -3 l3 7 M-1 -9 l-4 4 M-1 -9 l4 3" stroke="#ff4a3a" strokeWidth="1.6" fill="none" className="tl-red" />
        <path d="M0 5 a2.4 2.4 0 1 1 0.01 0 M0 9 v6 l-4 3 M0 15 l4 3 M0 11 l-4 1 M0 11 l4 -1" stroke="#3ae07a" strokeWidth="1.6" fill="none" className="tl-green" />
      </g>
      <g className="snow-cap"><rect x="3" y="-233" width="22" height="4" rx="2" fill={SNOW} /></g>
    </g>
  )
})

/**
 * Свечение светофора (в слое света, синхронно с CSS-циклом): маленький мягкий ореол у линзы
 * (радиальный градиент, не сплошной круг) и слабое цветное пятно на мокром асфальте у основания столба.
 */
export function TrafficGlow({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const cx = x + 14 * s
  return (
    <g style={{ mixBlendMode: 'screen' }} pointerEvents="none">
      <circle cx={cx} cy={y - 218 * s} r={15 * s} fill="url(#glow-red)" className="tl-red" />
      <circle cx={cx} cy={y - 198 * s} r={15 * s} fill="url(#glow-amber)" className="tl-yellow" />
      <circle cx={cx} cy={y - 178 * s} r={15 * s} fill="url(#glow-green)" className="tl-green" />
      {/* отражение на мокром асфальте: размытое пятно у столба, а не полоса через переход */}
      <g style={{ opacity: 'calc(var(--wet) * 0.6)' }}>
        <ellipse cx={x + 6 * s} cy={y + 10} rx={22 * s} ry={4 * s} fill="url(#glow-red)" className="tl-red" />
        <ellipse cx={x + 6 * s} cy={y + 10} rx={22 * s} ry={4 * s} fill="url(#glow-green)" className="tl-green" />
      </g>
    </g>
  )
}

/** Дорожный знак на стойке. kind: crossing (пешеходный переход), bus (остановка), parking. */
export const RoadSign = memo(function RoadSign({ x, y, kind, s = 1 }: { x: number; y: number; kind: 'crossing' | 'bus' | 'parking'; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-2" y="-150" width="4" height="150" fill="url(#brushed-v)" />
      <g transform="translate(0 -166)">
        <rect x="-18" y="-18" width="36" height="36" rx="3" fill="#f4f4f0" />
        <rect x="-16" y="-16" width="32" height="32" rx="2" fill={kind === 'parking' ? '#1f5fbf' : '#1f5fbf'} />
        {kind === 'crossing' && (
          <g>
            <path d="M-12 12 L0 -13 L12 12 Z" fill="#f4f4f0" />
            <path d="M-6 9 h12 M-3 4 h6" stroke="#1d1d24" strokeWidth="1.8" />
            <circle cx="1" cy="-4" r="1.8" fill="#1d1d24" />
            <path d="M0 -2 l-2 6 l-3 4 M-2 4 l3 4 M0 0 l3 2" stroke="#1d1d24" strokeWidth="1.3" fill="none" />
          </g>
        )}
        {kind === 'parking' && <text x="0" y="9" fontSize="24" textAnchor="middle" fill="#f4f4f0" fontFamily="Manrope, sans-serif" fontWeight="800">P</text>}
        {kind === 'bus' && <text x="0" y="8" fontSize="20" textAnchor="middle" fill="#f4f4f0" fontFamily="Manrope, sans-serif" fontWeight="800">А</text>}
        <rect x="-18" y="-18" width="36" height="12" fill="#fff" opacity=".12" />
      </g>
      <g className="snow-cap"><rect x="-18" y="-187" width="36" height="4" rx="2" fill={SNOW} /></g>
    </g>
  )
})

/** Бордюр: гранитная грань с бликом и тенью. */
export function Curb({ y, h = 8, x0 = -200, x1 = 1800 }: { y: number; h?: number; x0?: number; x1?: number }) {
  return (
    <g>
      <rect x={x0} y={y} width={x1 - x0} height={h} fill="#8d8a92" />
      <rect x={x0} y={y} width={x1 - x0} height="2" fill="#c8c4c6" />
      <rect x={x0} y={y} width={x1 - x0} height={h} fill="url(#tex-grain)" opacity=".5" />
      {Array.from({ length: Math.ceil((x1 - x0) / 90) }, (_, i) => <rect key={i} x={x0 + i * 90} y={y} width="1.2" height={h} fill="#4a4650" opacity=".5" />)}
      <rect x={x0} y={y + h} width={x1 - x0} height="5" fill="url(#ao-down)" opacity=".6" />
      <g className="wet-sheen"><rect x={x0} y={y} width={x1 - x0} height="2" fill="#fff" opacity=".5" /></g>
      <g className="snow-cap"><rect x={x0} y={y - 4} width={x1 - x0} height="6" rx="3" fill={SNOW} /></g>
    </g>
  )
}

/** Контактная сеть троллейбуса/трамвая и растяжки между домами (провисающие провода). */
export function Wires({ y = 470, seed = 4 }: { y?: number; seed?: number }) {
  const rng = mulberry32(seed)
  const sag = (x0: number, x1: number, yy: number, d: number) => `M${x0} ${yy} Q${(x0 + x1) / 2} ${yy + d} ${x1} ${yy}`
  let tension = ''
  for (let x = -100; x < 1700; x += 360 + rng() * 80) tension += sag(x, x + 360, y - 40 + rng() * 10, 18) + ' '
  return (
    <g fill="none" pointerEvents="none">
      <path d={tension} stroke="#1e1c24" strokeWidth="1.4" opacity=".7" />
      <path d={sag(-100, 1700, y, 26)} stroke="#1e1c24" strokeWidth="1.6" opacity=".8" />
      <path d={sag(-100, 1700, y + 9, 26)} stroke="#1e1c24" strokeWidth="1.6" opacity=".8" />
      {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${i * 300 + 40} ${y - 36} L${i * 300 + 40} ${y + 14}`} stroke="#1e1c24" strokeWidth="1" opacity=".6" />)}
      {/* гирлянда над улицей (горит вечером) */}
      <path d={sag(-100, 1700, y - 70, 30)} stroke="#2a2830" strokeWidth="1" opacity=".6" />
      <g className="lamp-lit">
        {Array.from({ length: 22 }, (_, i) => {
          const t = i / 21
          const xx = -100 + t * 1800
          const yy = y - 70 + 4 * 30 * t * (1 - t)
          return <circle key={i} cx={xx} cy={yy + 3} r="2.2" fill={i % 3 ? '#ffe2a0' : '#ffb8a0'} />
        })}
      </g>
    </g>
  )
}

/** Урна с крышкой. */
export const Bin = memo(function Bin({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="2" cy="1" rx="16" ry="3.5" fill="url(#contact)" />
      <path d="M-11 0 L-12 -34 H12 L11 0 Z" fill="#3c4a3e" />
      <path d="M-11 0 L-12 -34 H12 L11 0 Z" fill="url(#shade-x)" />
      <path d="M-13 -34 Q0 -42 13 -34 Z" fill="#2c362e" />
      <path d="M-8 -28 v22 M-3 -28 v22 M2 -28 v22 M7 -28 v22" stroke="#000" strokeOpacity=".2" />
      <g className="snow-cap"><path d="M-13 -35 Q0 -45 13 -35 Z" fill={SNOW} /></g>
    </g>
  )
})

/** Газетный/цветочный киоск с витриной и вывеской. */
export const Kiosk = memo(function Kiosk({ x, y, label = 'ЦВЕТЫ', s = 1 }: { x: number; y: number; label?: string; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="2" rx="70" ry="7" fill="url(#contact)" />
      <rect x="-60" y="-96" width="120" height="96" fill="#2f5a4e" />
      <rect x="-60" y="-96" width="120" height="96" fill="url(#shade-x)" />
      <rect x="-52" y="-74" width="104" height="52" fill="#2a2234" />
      <rect x="-52" y="-74" width="104" height="52" fill="url(#shop-warm)" className="shop-lit" />
      {[-40, -24, -8, 8, 24, 40].map((dx, i) => <circle key={dx} cx={dx} cy={-34 - (i % 2) * 8} r="6" fill={['#e8607a', '#f2c94c', '#f4f0f2', '#d94a5a', '#c8a0e0', '#f29a5a'][i]} />)}
      <path d="M-66 -96 L66 -96 L60 -114 L-60 -114 Z" fill="#c8a24a" />
      <text x="0" y="-100" fontSize="12" textAnchor="middle" fill="#1d2a26" fontFamily="Unbounded, sans-serif" fontWeight="500" letterSpacing="2">{label}</text>
      <path d="M-52 -74 L-20 -74 L-44 -22 L-52 -22 Z" fill="#fff" opacity=".12" />
      <g className="snow-cap"><path d="M-62 -114 L62 -114 L58 -120 L-58 -120 Z" fill={SNOW} /></g>
    </g>
  )
})

/** Стая птиц, пересекающая небо (только днём; CSS-анимация). */
export function Birds({ y = 180, n = 5, delay = 0, dur = 46 }: { y?: number; n?: number; delay?: number; dur?: number }) {
  return (
    <g className="day-only">
      <g className="ambient-anim" style={{ animation: `bird-fly ${dur}s linear ${delay}s infinite` }}>
        {Array.from({ length: n }, (_, i) => (
          <g key={i} transform={`translate(${-i * 26 - (i % 2) * 8} ${y + (i % 3) * 12 - i * 3})`}>
            <path d="M-7 0 Q-3.5 -4 0 0 Q3.5 -4 7 0" stroke="#2a2836" strokeWidth="1.6" fill="none" strokeLinecap="round" style={{ transformOrigin: '0px 0px', animation: `wing ${0.5 + (i % 3) * 0.08}s ease-in-out infinite` }} />
          </g>
        ))}
      </g>
    </g>
  )
}

/** Голуби на дорожке (клюют — лёгкая анимация головы). */
export function Pigeons({ x, y, n = 4 }: { x: number; y: number; n?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${x + i * 22 + (i % 2) * 6} ${y + (i % 2) * 5}) scale(${i % 2 ? -1 : 1} 1)`}>
          <ellipse cx="0" cy="0.5" rx="7" ry="1.6" fill="url(#contact)" />
          <ellipse cx="0" cy="-5" rx="7" ry="4.4" fill="#7a7c8c" />
          <path d="M-7 -6 L-12 -4 L-7 -3 Z" fill="#5a5c6a" />
          <g style={{ transformOrigin: '4px -6px', animation: `head-nod ${1.1 + i * 0.3}s ease-in-out infinite` }}>
            <circle cx="6" cy="-9" r="2.8" fill="#6a6c7c" />
            <path d="M8.6 -9 l2 0.6 l-2 0.6 Z" fill="#c8a080" />
          </g>
          <path d="M-1 -1 v2 M2 -1 v2" stroke="#c87a6a" strokeWidth=".9" />
        </g>
      ))}
    </g>
  )
}

/** Пешеходная разметка «зебра». */
export function Zebra({ x, y0, y1, w = 190 }: { x: number; y0: number; y1: number; w?: number }) {
  const n = Math.floor(w / 24)
  return (
    <g>
      {Array.from({ length: n }, (_, k) => <rect key={k} x={x + k * 24} y={y0} width="13" height={y1 - y0} fill="#ece8de" opacity=".78" />)}
      <rect x={x} y={y0} width={w} height={y1 - y0} fill="url(#tex-asphalt)" opacity=".5" />
    </g>
  )
}
