import type { ReactNode } from 'react'
import { LOCATIONS } from '../../data/locations'
import { mixHex } from '../../utils/math'
import type { MapPin } from './mapGeo'

/**
 * Мини-диорамы локаций (56×60, основание на y=56): экструзия из трёх граней — фасад, боковая грань, крыша.
 * Окна (.map-win) ночью теплеют по --map-night. Цвета берутся из темы локации — те же, что в сцене.
 */

interface BoxProps {
  x: number
  /** y основания фасада */
  y: number
  w: number
  h: number
  d?: number
  color: string
  /** сетка окон: колонки × ряды */
  win?: [cols: number, rows: number]
  roof?: string
}

function Box({ x, y, w, h, d = 8, color, win, roof }: BoxProps): ReactNode {
  const dy = d * 0.6
  const top = roof ?? mixHex(color, '#ffffff', 0.28)
  const side = mixHex(color, '#2a2040', 0.35)
  const cells: ReactNode[] = []
  if (win) {
    const [cols, rows] = win
    const cw = w / (cols * 2 + 1)
    const rh = (h - 4) / (rows * 2)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        cells.push(
          <rect
            key={`${r}-${c}`}
            className="map-win"
            x={x + cw * (1 + c * 2)}
            y={y - h + 3 + rh * (0.5 + r * 2)}
            width={cw}
            height={rh}
            rx={0.5}
          />,
        )
  }
  return (
    <g>
      <polygon
        points={`${x + w},${y - h} ${x + w + d},${y - h - dy} ${x + w + d},${y - dy} ${x + w},${y}`}
        fill={side}
      />
      <polygon
        points={`${x},${y - h} ${x + d},${y - h - dy} ${x + w + d},${y - h - dy} ${x + w},${y - h}`}
        fill={top}
      />
      <rect x={x} y={y - h} width={w} height={h} fill={color} />
      {cells}
    </g>
  )
}

function Tree({ x, y, r = 7, color = '#5f8f4e' }: { x: number; y: number; r?: number; color?: string }) {
  return (
    <g>
      <rect x={x - 1} y={y - r * 0.9} width={2} height={r * 0.9} fill="#5a4032" />
      <circle cx={x} cy={y - r * 1.35} r={r} fill={color} />
      <circle cx={x - r * 0.35} cy={y - r * 1.6} r={r * 0.55} fill={mixHex(color, '#ffffff', 0.25)} />
    </g>
  )
}

function Art({ pin }: { pin: MapPin }): ReactNode {
  const th = LOCATIONS[pin.id].theme
  const w = th.wall
  switch (pin.kind) {
    case 'park':
      return (
        <>
          <ellipse cx={28} cy={55} rx={22} ry={4.5} fill="#6f9a5a" opacity={0.7} />
          <Tree x={17} y={54} r={8} color="#6c9c55" />
          <Tree x={34} y={53} r={10} color="#5b8c4a" />
          <Tree x={44} y={55} r={6} color="#7aa862" />
          {pin.id === 'vdnh' && <Box x={20} y={50} w={16} h={14} d={6} color="#efe0bd" roof="#ffd36b" win={[2, 1]} />}
          {pin.id === 'zaryadye' && <path d="M8 56 Q28 40 48 56" stroke="#dfe9f0" strokeWidth={3} fill="none" />}
          {pin.id === 'patriarshy' && <ellipse cx={28} cy={52} rx={10} ry={3} fill="#6aa3d2" />}
        </>
      )
    case 'city':
      return (
        <>
          <Box x={8} y={56} w={9} h={30} d={6} color="#8ea2c4" win={[2, 6]} roof="#c8d6ee" />
          <Box x={20} y={56} w={11} h={46} d={6} color="#7c8fb3" win={[2, 9]} roof="#dbe6fb" />
          <Box x={34} y={56} w={9} h={36} d={6} color="#a9b8d6" win={[2, 7]} roof="#e5eefc" />
          <rect x={25} y={9} width={1.5} height={5} fill="#ff6b6b" className="map-lamp" />
        </>
      )
    case 'office':
      return <Box x={14} y={56} w={22} h={34} d={9} color="#9fb2d4" win={[3, 6]} roof="#d9e4f8" />
    case 'home':
      return (
        <>
          <Box x={12} y={56} w={24} h={20} d={8} color={w[0]} win={[2, 2]} roof={w[2]} />
          <polygon points="10,36 24,24 38,36" fill="#b5584a" />
          <polygon points="38,36 46,31 32,19 24,24" fill="#8f4338" />
          <rect x={36} y={22} width={4} height={8} fill="#7a5a50" />
        </>
      )
    case 'cafe':
      return (
        <>
          <Box x={11} y={56} w={26} h={20} d={8} color={w[1] ?? w[0]} win={[2, 1]} roof="#e8d6c0" />
          <polygon points="9,37 39,37 36,43 12,43" fill={th.accent} />
          <polygon points="12,43 36,43 36,45 12,45" fill="#fff3e2" opacity={0.8} />
          <circle cx={46} cy={44} r={3.2} fill="#fff3e2" />
          <path d="M44 43.5h5v2.5a2.5 2.5 0 0 1-5 0z" fill="#8a5a3c" />
        </>
      )
    case 'shop':
      return (
        <>
          <Box x={11} y={56} w={26} h={18} d={8} color={w[2] ?? w[0]} win={[2, 1]} roof="#f0dcc6" />
          <rect x={14} y={36} width={20} height={5} rx={1} fill={th.accent} />
          <rect x={20} y={46} width={8} height={10} fill="#5a3f4a" opacity={0.85} />
        </>
      )
    case 'courtyard':
      return (
        <>
          <Box x={5} y={56} w={16} h={28} d={6} color={w[0]} win={[2, 4]} roof={w[2]} />
          <Box x={30} y={56} w={16} h={22} d={6} color={w[1] ?? w[0]} win={[2, 3]} roof={w[2]} />
          <Tree x={24} y={55} r={5} color="#6c9c55" />
        </>
      )
    default:
      return (
        <>
          <Box x={5} y={56} w={14} h={24} d={6} color={w[0]} win={[2, 4]} roof={w[2] ?? w[0]} />
          <Box x={22} y={56} w={13} h={34} d={6} color={w[1] ?? w[0]} win={[2, 5]} roof={w[2] ?? w[0]} />
          <Box x={37} y={56} w={11} h={20} d={5} color={w[3] ?? w[0]} win={[1, 3]} roof={w[2] ?? w[0]} />
        </>
      )
  }
}

export function PinArt({ pin }: { pin: MapPin }) {
  return (
    <svg
      width={56}
      height={60}
      viewBox="0 0 56 60"
      aria-hidden
      focusable="false"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <ellipse cx={28} cy={57} rx={20} ry={3.5} fill="rgba(20,10,35,.38)" />
      <Art pin={pin} />
    </svg>
  )
}
