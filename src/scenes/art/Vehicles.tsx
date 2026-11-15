import { memo } from 'react'
import { mixHex } from '../../utils/math'

export type VehicleKind = 'car' | 'taxi' | 'bus' | 'tram' | 'bike' | 'scooter'

interface Props {
  kind: VehicleKind
  color?: string
  facing?: 1 | -1
  riderColor?: string
  /** стоит: колёса не крутятся */
  still?: boolean
  /** текст на маршрутном табло автобуса (event.line.name) */
  route?: string
  /** двери открыты (остановка: посадка/выход) */
  doorsOpen?: boolean
}

const INK = '#1a1428'
const SNOW = '#f2f5fc'

const Wheel = ({ cx, r = 15, spin = true }: { cx: number; r?: number; spin?: boolean }) => (
  <g transform={`translate(${cx} ${-r})`}>
    <circle r={r} fill="#18161e" />
    <circle r={r * 0.62} fill="url(#brushed-h)" />
    <g style={spin ? { animation: 'tunnel-spin 0.45s linear infinite', transformBox: 'fill-box', transformOrigin: 'center' } : undefined}>
      <path d={`M0 ${-r * 0.55} V${r * 0.55} M${-r * 0.55} 0 H${r * 0.55} M${-r * 0.39} ${-r * 0.39} L${r * 0.39} ${r * 0.39} M${-r * 0.39} ${r * 0.39} L${r * 0.39} ${-r * 0.39}`} stroke="#5a5e6a" strokeWidth="1.8" />
    </g>
    <circle r={r * 0.18} fill="#2a2a32" />
    <path d={`M${-r * 0.8} ${-r * 0.5} A${r * 0.9} ${r * 0.9} 0 0 1 ${r * 0.2} ${-r * 0.9}`} stroke="#fff" strokeWidth="1" opacity=".15" fill="none" />
  </g>
)

/** Фары/габариты + конус света (виден в темноте/пасмурно) + отражение на мокром. */
const Lights = ({ front, back, y }: { front: number; back: number; y: number }) => (
  <g>
    <path d={`M${front - 9} ${y} L${front} ${y + 1} L${front} ${y + 7} L${front - 10} ${y + 6} Z`} fill="#fff6d8" />
    <rect x={back} y={y} width="6" height="8" rx="2" fill="#d8323a" />
    <path className="lamp-lit" d={`M${front + 1} ${y + 3} L${front + 150} ${y + 30} L${front + 150} ${y - 16} Z`} fill="url(#headlight)" style={{ mixBlendMode: 'screen' }} />
    <circle className="lamp-lit" cx={back + 3} cy={y + 4} r="11" fill="#ff4a4a" opacity=".35" />
  </g>
)

/** Отражение машины в мокром асфальте (смазанные огни). */
const WetRefl = ({ w, front, back }: { w: number; front: number; back: number }) => (
  <g className="wet-sheen">
    <ellipse cx="0" cy="6" rx={w} ry="5" fill="#000" opacity=".25" />
    <g className="lamp-lit">
      <rect x={front - 10} y="3" width="8" height="34" rx="4" fill="url(#refl-warm)" />
      <rect x={back} y="3" width="7" height="26" rx="3.5" fill="#ff5a5a" opacity=".3" />
    </g>
  </g>
)

function Car({ color = '#5a7ab8', taxi, still }: { color?: string; taxi?: boolean; still?: boolean }) {
  const body = taxi ? '#f2c230' : color
  const dk = mixHex(body, INK, 0.35)
  const lt = mixHex(body, '#ffffff', 0.35)
  const shell = 'M-90 -16 L-91 -36 Q-90 -44 -80 -46 L-50 -50 Q-36 -74 -10 -75 L26 -75 Q48 -74 62 -50 L82 -46 Q93 -44 93 -32 L92 -16 Z'
  return (
    <g>
      <path d={shell} fill={body} />
      <path d={shell} fill="url(#shade-y)" />
      {/* окна: тонированное стекло + отражение неба */}
      <path d="M-43 -50 Q-32 -69 -12 -69 L1 -69 L1 -50 Z" fill="#2b3348" />
      <path d="M7 -50 L7 -69 L25 -69 Q43 -67 54 -50 Z" fill="#2b3348" />
      <path d="M-40 -51 Q-30 -66 -14 -67 L-20 -51 Z M10 -67 L22 -67 L14 -51 L9 -51 Z" fill="#cfe0f0" opacity=".35" />
      <path d="M-14 -50 L-14 -18 M44 -46 L44 -18" stroke={dk} strokeWidth="1.2" opacity=".7" />
      {/* линия кузова, ручки, зеркало */}
      <path d="M-88 -34 Q0 -38 90 -34" stroke={lt} strokeWidth="1.6" opacity=".55" fill="none" />
      <path d="M-86 -24 L88 -24" stroke={dk} strokeWidth="1.5" opacity=".45" />
      <rect x="-4" y="-44" width="8" height="2.2" rx="1" fill={dk} />
      <rect x="32" y="-44" width="8" height="2.2" rx="1" fill={dk} />
      <path d="M52 -52 l7 -2 l1 5 l-7 1 Z" fill={dk} />
      <rect x="-91" y="-22" width="183" height="6" rx="2" fill="#24222c" />
      {taxi && (
        <g>
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x={-80 + i * 13} y={-32 + (i % 2) * 3.5} width="6.5" height="3.5" fill="#1d1d28" />
          ))}
          <path d="M-14 -75 L-12 -84 L18 -84 L20 -75 Z" fill="#f6efc8" />
          <text x="3" y="-77.5" fontSize="6.2" textAnchor="middle" fill="#1d1d28" fontFamily="Manrope, sans-serif" fontWeight="800">ТАКСИ</text>
        </g>
      )}
      <Wheel cx={-55} spin={!still} />
      <Wheel cx={58} spin={!still} />
      <path d="M-74 -16 Q-55 -40 -36 -16 M39 -16 Q58 -40 77 -16" stroke="#14121a" strokeWidth="3" fill="none" opacity=".5" />
      <Lights front={93} back={-92} y={-40} />
      <g className="snow-cap">
        <path d="M-36 -74 Q-10 -80 26 -76 Q40 -76 46 -72 L-30 -71 Z" fill={SNOW} />
        <path d="M62 -50 L82 -47 Q90 -46 92 -42 L64 -46 Z" fill={SNOW} />
      </g>
      <WetRefl w={92} front={93} back={-92} />
    </g>
  )
}

function Bus({ color = '#c8323a', route = 'м27 Тверская', still, doorsOpen }: { color?: string; route?: string; still?: boolean; doorsOpen?: boolean }) {
  const accent = color === '#e2dccf' || color === '#3c3c48' ? '#2c5aa0' : color
  return (
    <g>
      <rect x="-170" y="-124" width="340" height="110" rx="12" fill="#eceae4" />
      <rect x="-170" y="-124" width="340" height="110" rx="12" fill="url(#shade-y)" />
      {/* полоса окон */}
      <rect x="-162" y="-108" width="300" height="48" rx="4" fill="#232a3c" />
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i}>
          <path d={`M${-158 + i * 50} -106 L${-130 + i * 50} -106 L${-150 + i * 50} -62 L${-158 + i * 50} -62 Z`} fill="#cfe0f0" opacity=".22" />
          <rect x={-162 + i * 50 + 46} y="-108" width="4" height="48" fill="#eceae4" />
          {/* силуэты пассажиров в окнах */}
          {i % 2 === 0 && <path d={`M${-140 + i * 50} -60 v-14 a7 7 0 1 1 14 0 v14 Z`} fill="#10141e" opacity=".55" />}
        </g>
      ))}
      <rect x="-162" y="-108" width="300" height="48" fill="#ffd590" opacity=".0" className="win-lit" style={{ opacity: 'calc(var(--lamps) * .35)' }} />
      {/* двери */}
      <rect x="80" y="-104" width="34" height="88" rx="3" fill="#2a3244" />
      <path d="M97 -104 V-16" stroke="#eceae4" strokeWidth="2" />
      <rect x="-60" y="-104" width="34" height="88" rx="3" fill="#2a3244" opacity=".9" />
      <path d="M-43 -104 V-16" stroke="#eceae4" strokeWidth="2" />
      {/* лобовое */}
      <path d="M138 -110 L166 -110 Q170 -100 170 -70 L138 -70 Z" fill="#2b3348" />
      <path d="M142 -108 L156 -108 L146 -74 L142 -74 Z" fill="#cfe0f0" opacity=".3" />
      <rect x="-170" y="-46" width="340" height="12" fill={accent} />
      <rect x="-170" y="-34" width="340" height="20" rx="4" fill="#3a3d48" />
      {/* маршрутное табло */}
      <rect x="-150" y="-121" width="70" height="11" rx="2" fill="#1a1820" />
      <text x="-146" y="-112.5" fontSize="8" fill="#ffae3a" fontFamily="ui-monospace, monospace" fontWeight="700">{route.length > 14 ? `${route.slice(0, 13)}…` : route}</text>
      {doorsOpen && (
        <g>
          {/* открытые двери: створки сложены, виден тёплый салон и ступенька */}
          <rect x="80" y="-104" width="34" height="88" rx="3" fill="#ffe2a8" />
          <rect x="80" y="-104" width="34" height="88" rx="3" fill="url(#glow-warm)" opacity=".6" />
          <rect x="78" y="-104" width="6" height="88" fill="#3a4258" />
          <rect x="110" y="-104" width="6" height="88" fill="#3a4258" />
          <rect x="80" y="-22" width="34" height="6" fill="#e8b820" />
          <rect x="-60" y="-104" width="34" height="88" rx="3" fill="#ffe2a8" opacity=".9" />
          <rect x="-62" y="-104" width="6" height="88" fill="#3a4258" />
          <rect x="-30" y="-104" width="6" height="88" fill="#3a4258" />
        </g>
      )}
      <Wheel cx={-108} r={19} spin={!still} />
      <Wheel cx={104} r={19} spin={!still} />
      <Lights front={170} back={-174} y={-44} />
      <g className="snow-cap"><rect x="-166" y="-129" width="332" height="7" rx="3.5" fill={SNOW} /></g>
      <WetRefl w={168} front={170} back={-174} />
    </g>
  )
}

function Tram() {
  return (
    <g>
      <path d="M-220 -14 L-220 -104 Q-220 -118 -206 -118 L196 -118 Q222 -116 224 -88 L224 -14 Z" fill="#efece6" />
      <path d="M-220 -14 L-220 -104 Q-220 -118 -206 -118 L196 -118 Q222 -116 224 -88 L224 -14 Z" fill="url(#shade-y)" />
      <rect x="-210" y="-104" width="400" height="44" rx="4" fill="#232a3c" />
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i}>
          <path d={`M${-206 + i * 50} -102 L${-180 + i * 50} -102 L${-198 + i * 50} -62 L${-206 + i * 50} -62 Z`} fill="#cfe0f0" opacity=".2" />
          <rect x={-210 + i * 50 + 46} y="-104" width="4" height="44" fill="#efece6" />
        </g>
      ))}
      <rect x="-210" y="-104" width="400" height="44" fill="#ffd590" className="win-lit" style={{ opacity: 'calc(var(--lamps) * .35)' }} />
      <rect x="-220" y="-52" width="444" height="16" fill="#b8323a" />
      <rect x="-220" y="-36" width="444" height="22" fill="#3a3d48" />
      <path d="M-30 -118 L-10 -152 L40 -152 L20 -118" stroke="#35303c" strokeWidth="3" fill="none" />
      <line x1="10" y1="-152" x2="10" y2="-168" stroke="#35303c" strokeWidth="2" />
      <Wheel cx={-160} r={14} />
      <Wheel cx={-120} r={14} />
      <Wheel cx={120} r={14} />
      <Wheel cx={160} r={14} />
      <Lights front={224} back={-224} y={-46} />
      <g className="snow-cap"><rect x="-214" y="-123" width="420" height="7" rx="3.5" fill={SNOW} /></g>
      <WetRefl w={220} front={224} back={-224} />
    </g>
  )
}

function Bike({ rider = '#b4473e' }: { rider?: string }) {
  const wheel = (x: number) => (
    <g transform={`translate(${x} -22)`}>
      <circle r="21" fill="none" stroke="#1d1b24" strokeWidth="3.4" />
      <circle r="18" fill="none" stroke="#8a8f9a" strokeWidth=".8" />
      <g style={{ animation: 'tunnel-spin 0.6s linear infinite', transformBox: 'fill-box', transformOrigin: 'center' }}>
        <path d="M-18 0H18M0 -18V18M-12.7 -12.7L12.7 12.7M-12.7 12.7L12.7 -12.7" stroke="#9a9eaa" strokeWidth=".7" />
      </g>
    </g>
  )
  const skin = '#ebc1a0'
  return (
    <g>
      {wheel(-34)}
      {wheel(34)}
      <path d="M-34 -22 L-8 -50 L20 -50 L34 -22 M-8 -50 L0 -22 L20 -50 M20 -50 L25 -62 L32 -62" stroke="#2c6a8a" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-14 -54 L-2 -54" stroke="#1d1b24" strokeWidth="4" strokeLinecap="round" />
      {/* райдер: ноги на педалях, корпус наклонён */}
      <path d="M-6 -56 L6 -36 L0 -20" stroke="#2b3044" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-6 -56 L-10 -38 L-2 -24" stroke="#20232f" strokeWidth="7.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-10 -58 Q-6 -84 8 -92 L16 -86 Q4 -74 0 -56 Z" fill={rider} />
      <path d="M-10 -58 Q-6 -84 8 -92 L16 -86 Q4 -74 0 -56 Z" fill="url(#shade-x)" />
      <path d="M8 -86 L26 -66 L30 -62" stroke={rider} strokeWidth="6.5" fill="none" strokeLinecap="round" />
      <circle cx="30" cy="-62" r="3" fill={skin} />
      <ellipse cx="14" cy="-100" rx="8.6" ry="9.6" fill={skin} />
      <path d="M4 -103 Q6 -114 16 -113 Q25 -112 24 -102 Z" fill="#e2e6ee" />
      <path d="M4 -103 Q6 -114 16 -113 Q25 -112 24 -102 Z" fill="url(#shade-y)" />
    </g>
  )
}

function Scooter({ rider = '#4f5ea8' }: { rider?: string }) {
  const skin = '#deaa86'
  return (
    <g>
      <rect x="-30" y="-10" width="62" height="5" rx="2.5" fill="#2a2a34" />
      <circle cx="-26" cy="-8" r="8" fill="#18161e" />
      <circle cx="30" cy="-8" r="8" fill="#18161e" />
      <circle cx="-26" cy="-8" r="3.5" fill="#8a8f9a" />
      <circle cx="30" cy="-8" r="3.5" fill="#8a8f9a" />
      <path d="M30 -10 L28 -64" stroke="url(#metal-v)" strokeWidth="4" />
      <rect x="20" y="-67" width="18" height="4" rx="2" fill="#2a2430" />
      <path d="M-4 -8 L-2 -46 M6 -8 L4 -46" stroke="#2b3044" strokeWidth="8" strokeLinecap="round" />
      <path d="M-12 -46 Q-12 -80 2 -84 Q14 -80 12 -46 Z" fill={rider} />
      <path d="M-12 -46 Q-12 -80 2 -84 Q14 -80 12 -46 Z" fill="url(#shade-x)" />
      <path d="M8 -76 L26 -66" stroke={rider} strokeWidth="6" strokeLinecap="round" />
      <circle cx="26" cy="-66" r="3" fill={skin} />
      <ellipse cx="3" cy="-94" rx="8.4" ry="9.6" fill={skin} />
      <path d="M-6 -97 Q-4 -107 4 -107 Q13 -106 12 -96 Q4 -100 -6 -97 Z" fill="#2a1d1a" />
    </g>
  )
}

function Vehicle({ kind, color, facing = 1, riderColor, still, route, doorsOpen }: Props) {
  const w = kind === 'bus' ? 170 : kind === 'tram' ? 222 : kind === 'car' || kind === 'taxi' ? 96 : 44
  return (
    <g transform={`scale(${facing} 1)`}>
      <ellipse cx="0" cy="1" rx={w} ry="7" fill="url(#contact)" />
      {kind === 'car' && <Car color={color} still={still} />}
      {kind === 'taxi' && <Car taxi still={still} />}
      {kind === 'bus' && <Bus color={color} route={route} still={still} doorsOpen={doorsOpen} />}
      {kind === 'tram' && <Tram />}
      {kind === 'bike' && <Bike rider={riderColor} />}
      {kind === 'scooter' && <Scooter rider={riderColor} />}
    </g>
  )
}

export default memo(Vehicle)
