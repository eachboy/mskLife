import { memo } from 'react'
import type { SceneTheme } from '../../types'
import { mixHex, mulberry32 } from '../../utils/math'
import { Building } from './primitives'

const HAZE = '#a4acd0'

const Onion = ({ cx, cy, r, c, cross = true }: { cx: number; cy: number; r: number; c: string; cross?: boolean }) => (
  <g>
    <path d={`M${cx - r * 0.35} ${cy + r * 0.6} Q${cx - r * 1.1} ${cy - r * 0.2} ${cx} ${cy - r * 1.7} Q${cx + r * 1.1} ${cy - r * 0.2} ${cx + r * 0.35} ${cy + r * 0.6} Z`} fill={c} />
    <path d={`M${cx - r * 0.2} ${cy - r * 0.2} Q${cx - r * 0.5} ${cy - r * 0.9} ${cx - r * 0.05} ${cy - r * 1.4}`} stroke="#fff" strokeWidth={r * 0.1} opacity=".3" fill="none" />
    {cross && <path d={`M${cx} ${cy - r * 1.7} v-${r * 0.7} m-${r * 0.2} ${r * 0.25} h${r * 0.4}`} stroke="#e8c15a" strokeWidth={Math.max(1.5, r * 0.09)} />}
  </g>
)

const Crenel = ({ x, w, y, c }: { x: number; w: number; y: number; c: string }) => (
  <g fill={c}>
    {Array.from({ length: Math.floor(w / 22) }, (_, i) => (
      <path key={i} d={`M${x + i * 22} ${y} v-14 h10 l-3 -6 h-4 l-3 6 Z`} />
    ))}
  </g>
)

function StalinTower({ x, y, h, c, haze }: { x: number; y: number; h: number; c: string; haze: number }) {
  const col = mixHex(c, HAZE, haze)
  const d = mixHex(col, '#2a2450', 0.2)
  return (
    <g>
      <rect x={x - 70} y={y - h * 0.45} width="140" height={h * 0.45} fill={col} />
      <rect x={x - 48} y={y - h * 0.7} width="96" height={h * 0.25} fill={col} />
      <rect x={x - 28} y={y - h * 0.88} width="56" height={h * 0.18} fill={col} />
      <path d={`M${x - 22} ${y - h * 0.88} L${x} ${y - h * 1.12} L${x + 22} ${y - h * 0.88} Z`} fill={d} />
      <line x1={x} y1={y - h * 1.12} x2={x} y2={y - h * 1.22} stroke={d} strokeWidth="3" />
      <path d={`M${x} ${y - h * 1.2} l3 6 l7 0 l-5 4 l2 7 l-7 -4 l-7 4 l2 -7 l-5 -4 l7 0 Z`} fill="#ffd36b" />
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} x={x - 52 + i * 22} y={y - h * 0.4} width="8" height={h * 0.3} fill={d} opacity=".5" />
      ))}
      {[0.2, 0.32, 0.5, 0.62].map((f, i) => (
        <rect key={i} x={x - 16} y={y - h * f - 16} width="32" height="10" rx="2" fill="#ffd27a" className="win-lit" style={{ opacity: `calc(var(--lamps) * ${1 - haze * 0.5})` }} />
      ))}
    </g>
  )
}

function FerrisWheel({ x, y, r, haze }: { x: number; y: number; r: number; haze: number }) {
  const col = mixHex('#e8e0f0', HAZE, haze)
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M-${r * 0.5} ${r + 40} L0 0 L${r * 0.5} ${r + 40}`} stroke={col} strokeWidth="6" fill="none" />
      <g style={{ animation: 'tunnel-spin 160s linear infinite' }}>
        <circle r={r} fill="none" stroke={col} strokeWidth="5" />
        <circle r={r * 0.62} fill="none" stroke={col} strokeWidth="2.5" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2
          return (
            <g key={i}>
              <line x1="0" y1="0" x2={Math.cos(a) * r} y2={Math.sin(a) * r} stroke={col} strokeWidth="2" />
              <g transform={`translate(${Math.cos(a) * r} ${Math.sin(a) * r})`}>
                <g style={{ animation: 'tunnel-spin 160s linear infinite reverse', transformBox: 'fill-box', transformOrigin: 'center' }}>
                  <rect x="-11" y="-2" width="22" height="18" rx="4" fill={['#e0526a', '#f2c14e', '#3f9d9a', '#8f5fa8'][i % 4]} />
                </g>
              </g>
            </g>
          )
        })}
      </g>
      <circle r="9" fill={col} />
    </g>
  )
}

function CityTowers({ haze, baseY }: { haze: number; baseY: number }) {
  const rng = mulberry32(11)
  const glass = (c: string) => mixHex(c, HAZE, haze)
  const defs = [
    { x: 260, w: 90, h: 330, c: '#7f93bd' },
    { x: 380, w: 80, h: 420, c: '#6c82b0' },
    { x: 520, w: 110, h: 520, c: '#8ba0c8' },
    { x: 680, w: 90, h: 600, c: '#7388b6', spire: true },
    { x: 820, w: 120, h: 380, c: '#93a8cc' },
    { x: 980, w: 84, h: 470, c: '#6f84b2' },
    { x: 1100, w: 100, h: 340, c: '#889dc6' },
    { x: 1240, w: 76, h: 280, c: '#7a8fba' },
  ]
  return (
    <g>
      {defs.map((d, i) => {
        const fill = glass(d.c)
        const top = baseY - d.h
        const rows = Math.floor(d.h / 18)
        const cols = Math.floor(d.w / 14)
        return (
          <g key={i}>
            <path d={d.spire ? `M${d.x} ${baseY} L${d.x} ${top + 30} L${d.x + d.w / 2} ${top - 70} L${d.x + d.w} ${top + 30} L${d.x + d.w} ${baseY} Z` : `M${d.x} ${baseY} L${d.x} ${top} L${d.x + d.w} ${top + (i % 2 ? 0 : 14)} L${d.x + d.w} ${baseY} Z`} fill={fill} />
            <rect x={d.x + d.w * 0.7} y={top + 10} width={d.w * 0.3} height={d.h - 10} fill="#fff" opacity=".07" />
            {Array.from({ length: rows * cols }, (_, k) => {
              const r = Math.floor(k / cols)
              const c = k % cols
              const on = rng() < 0.45
              return on ? <rect key={k} x={d.x + 5 + c * 14} y={top + 16 + r * 18} width="8" height="9" fill="#ffe3a0" className="win-lit" style={{ opacity: `calc(var(--lamps) * ${0.85 - haze * 0.4})` }} /> : null
            })}
            {d.spire && <line x1={d.x + d.w / 2} y1={top - 70} x2={d.x + d.w / 2} y2={top - 130} stroke={fill} strokeWidth="3" />}
          </g>
        )
      })}
    </g>
  )
}

/** Силуэты и достопримечательности дальнего плана (baseline ≈ y 560). */
export const Landmark = memo(function Landmark({ theme, haze = 0.3, baseY = 560 }: { theme: SceneTheme; haze?: number; baseY?: number }) {
  const hz = (c: string, k = haze) => mixHex(c, HAZE, k)
  const y = baseY

  switch (theme.landmark) {
    case 'gorky':
      return (
        <g>
          <FerrisWheel x={1080} y={y - 250} r={170} haze={haze} />
          {/* входная арка */}
          <g>
            <rect x="260" y={y - 190} width="40" height="190" fill={hz('#f1ebe0')} />
            <rect x="520" y={y - 190} width="40" height="190" fill={hz('#f1ebe0')} />
            <rect x="240" y={y - 214} width="340" height="30" fill={hz('#f1ebe0')} />
            <rect x="240" y={y - 214} width="340" height="8" fill={hz('#d94c4c')} />
            <text x="410" y={y - 190} fontSize="20" fill={hz('#8a2a2a')} textAnchor="middle" fontFamily="Unbounded, sans-serif" fontWeight="700">ПАРК</text>
          </g>
          <Building x={1280} w={150} h={200} y={y} color={hz('#d9c4a8')} seed={31} haze={0} lit={0.4} />
          <Building x={1440} w={140} h={140} y={y} color={hz('#c8a38a')} seed={33} haze={0} lit={0.4} />
        </g>
      )
    case 'zaryadye':
      return (
        <g>
          {/* стена Кремля */}
          <rect x="520" y={y - 70} width="1080" height="70" fill={hz('#a8483a', 0.15)} />
          <Crenel x={520} w={1080} y={y - 70} c={hz('#a8483a', 0.15)} />
          {/* Спасская башня */}
          <g>
            <rect x="1340" y={y - 220} width="64" height="220" fill={hz('#a8483a', 0.15)} />
            <rect x="1330" y={y - 240} width="84" height="30" fill={hz('#b85442', 0.15)} />
            <path d="M1334 -0" />
            <path d={`M1342 ${y - 240} L1372 ${y - 330} L1402 ${y - 240} Z`} fill={hz('#3f7a62', 0.15)} />
            <path d={`M1372 ${y - 330} l3 -22 l-3 8 l-3 -8 Z`} fill="#e04a4a" />
            <circle cx="1372" cy={y - 188} r="14" fill="#f1ebe0" />
            <path d={`M1372 ${y - 188} v-9 M1372 ${y - 188} l6 4`} stroke="#2a2430" strokeWidth="2" />
          </g>
          {/* Покровский собор */}
          <g>
            <rect x="900" y={y - 120} width="160" height="120" fill={hz('#c25a48', 0.15)} />
            <rect x="950" y={y - 210} width="60" height="90" fill={hz('#f1ebe0', 0.15)} />
            <path d={`M946 ${y - 210} L980 ${y - 290} L1014 ${y - 210} Z`} fill={hz('#3f9d6a', 0.15)} />
            <Onion cx={908} cy={y - 150} r={20} c={hz('#e0a83a', 0.15)} />
            <Onion cx={1052} cy={y - 150} r={20} c={hz('#3f9d9a', 0.15)} />
            <Onion cx={930} cy={y - 196} r={18} c={hz('#c0443a', 0.15)} />
            <Onion cx={1030} cy={y - 196} r={18} c={hz('#e0a83a', 0.15)} />
            <Onion cx={980} cy={y - 296} r={16} c={hz('#e0a83a', 0.15)} />
          </g>
          {/* парящий мост: опирается на холм парка (с подпорной стеной), консоль выносится над рекой */}
          <g>
            {/* холм-терраса парка с ландшафтом */}
            <path d={`M20 ${y} Q120 ${y - 40} 260 ${y - 62} L470 ${y - 70} Q520 ${y - 68} 540 ${y - 50} L560 ${y} Z`} fill={hz('#5c7f4c', 0.2)} />
            <path d={`M20 ${y} Q120 ${y - 40} 260 ${y - 62} L470 ${y - 70}`} stroke={hz('#7da066', 0.2)} strokeWidth="4" fill="none" />
            {/* стеклянная «кора» концертного зала под холмом */}
            <path d={`M90 ${y} Q200 ${y - 38} 330 ${y - 44} L330 ${y} Z`} fill={hz('#9fc4d8', 0.25)} opacity=".75" />
            {[130, 180, 230, 280].map((gx) => <line key={gx} x1={gx} y1={y} x2={gx} y2={y - 40} stroke={hz('#6f8fa8', 0.2)} strokeWidth="2" />)}
            {/* подпорная стена и опоры под корнем консоли */}
            <rect x="470" y={y - 66} width="80" height="66" fill={hz('#b9b2a4', 0.15)} />
            <path d={`M520 ${y} L600 ${y - 66} M560 ${y} L640 ${y - 70}`} stroke={hz('#cfc8ba', 0.15)} strokeWidth="9" strokeLinecap="round" />
            {/* настил: толстый у берега, утоньшается к концу */}
            <path d={`M400 ${y - 72} Q620 ${y - 92} 820 ${y - 86} L820 ${y - 80} Q660 ${y - 80} 540 ${y - 58} L470 ${y - 58} Z`} fill={hz('#efeae0', 0.1)} />
            <path d={`M400 ${y - 72} Q620 ${y - 92} 820 ${y - 86}`} stroke={hz('#c9c2b4', 0.1)} strokeWidth="2" fill="none" />
            {/* стеклянное ограждение */}
            <path d={`M400 ${y - 84} Q620 ${y - 104} 820 ${y - 98} L820 ${y - 86} Q620 ${y - 92} 400 ${y - 72} Z`} fill="#dff1ff" opacity=".35" />
            <path d={`M400 ${y - 84} Q620 ${y - 104} 820 ${y - 98}`} stroke="#fff" strokeWidth="1.5" fill="none" opacity=".7" />
          </g>
        </g>
      )
    case 'vdnh':
      return (
        <g>
          {/* центральный вход */}
          <g>
            <rect x="500" y={y - 190} width="560" height="190" fill={hz('#f1e4c8', 0.2)} />
            <path d={`M640 ${y} V${y - 120} A 140 140 0 0 1 920 ${y - 120} V${y} Z`} fill={hz('#d7c39a', 0.2)} />
            <path d={`M668 ${y} V${y - 120} A 112 112 0 0 1 892 ${y - 120} V${y} Z`} fill={hz('#8a98c0', 0.3)} />
            {Array.from({ length: 8 }, (_, i) => (
              <rect key={i} x={512 + i * 6.5 + (i > 3 ? 430 : 0)} y={y - 180} width="5" height="180" fill={hz('#fff6e0', 0.2)} opacity=".6" />
            ))}
            <rect x="480" y={y - 218} width="600" height="32" fill={hz('#e8d7b0', 0.2)} />
            <path d={`M780 ${y - 218} l-40 -50 h80 Z`} fill={hz('#e0b84a', 0.15)} />
            <path d={`M780 ${y - 300} l4 12 h12 l-10 8 l4 12 l-10 -7 l-10 7 l4 -12 l-10 -8 h12 Z`} fill="#ffd36b" />
          </g>
          <StalinTower x={1300} y={y} h={300} c="#e5d4b0" haze={haze + 0.1} />
        </g>
      )
    case 'neskuchny':
      return (
        <g>
          {/* колоннада */}
          <g>
            <rect x="620" y={y - 150} width="420" height="150" fill={hz('#f1e8d6', 0.2)} />
            <path d={`M600 ${y - 150} L830 ${y - 220} L1060 ${y - 150} Z`} fill={hz('#e0d2b6', 0.2)} />
            {Array.from({ length: 8 }, (_, i) => (
              <rect key={i} x={636 + i * 52} y={y - 140} width="18" height="140" fill={hz('#fffaf0', 0.2)} />
            ))}
          </g>
          <g fill={hz('#4f6d46', 0.35)}>
            {[150, 330, 1180, 1400].map((cx, i) => (
              <g key={i}>
                <circle cx={cx} cy={y - 140} r={90} />
                <circle cx={cx + 60} cy={y - 100} r={70} />
                <circle cx={cx - 60} cy={y - 90} r={64} />
              </g>
            ))}
          </g>
        </g>
      )
    case 'arbat':
      return (
        <g>
          <StalinTower x={1280} y={y} h={380} c="#d9c8aa" haze={haze + 0.2} />
          <Building x={140} w={180} h={250} y={y} color={hz('#d6a58a', 0.2)} seed={91} roof="mansard" haze={0} />
          <Building x={330} w={140} h={200} y={y} color={hz('#e8c9a0', 0.2)} seed={92} haze={0} />
        </g>
      )
    case 'kitay':
      return (
        <g>
          <rect x="0" y={y - 80} width="1600" height="80" fill={hz('#eadfd0', 0.15)} />
          <Crenel x={0} w={1600} y={y - 80} c={hz('#eadfd0', 0.15)} />
          {[260, 920].map((tx, i) => (
            <g key={i}>
              <rect x={tx} y={y - 210} width="90" height="210" fill={hz('#e8dccb', 0.15)} />
              <path d={`M${tx - 8} ${y - 210} L${tx + 45} ${y - 290} L${tx + 98} ${y - 210} Z`} fill={hz('#a8483a', 0.15)} />
              <rect x={tx + 28} y={y - 160} width="34" height="48" rx="17" fill={hz('#5a4a52', 0.2)} />
            </g>
          ))}
          <Onion cx={1380} cy={y - 150} r={26} c={hz('#e0a83a', 0.2)} />
          <rect x="1354" y={y - 140} width="52" height="140" fill={hz('#eadfd0', 0.15)} />
        </g>
      )
    case 'zamoskvorechye':
      return (
        <g>
          <g>
            <rect x="960" y={y - 150} width="120" height="150" fill={hz('#f1ebe0', 0.2)} />
            <Onion cx={1020} cy={y - 190} r={34} c={hz('#3f7ac0', 0.2)} />
            <Onion cx={976} cy={y - 150} r={16} c={hz('#3f7ac0', 0.2)} />
            <Onion cx={1064} cy={y - 150} r={16} c={hz('#3f7ac0', 0.2)} />
            <rect x="1090" y={y - 230} width="44" height="230" fill={hz('#f1ebe0', 0.2)} />
            <path d={`M1086 ${y - 230} L1112 ${y - 290} L1138 ${y - 230} Z`} fill={hz('#e0a83a', 0.2)} />
          </g>
          <Building x={200} w={170} h={170} y={y} color={hz('#d9b48c', 0.15)} seed={51} roof="pitched" haze={0} />
          <Building x={380} w={140} h={130} y={y} color={hz('#c9886f', 0.15)} seed={52} roof="pitched" haze={0} />
        </g>
      )
    case 'patriarshy':
      return (
        <g>
          <Building x={700} w={300} h={170} y={y} color={hz('#e6c9a0', 0.2)} seed={61} roof="mansard" haze={0} />
          {Array.from({ length: 6 }, (_, i) => <rect key={i} x={730 + i * 46} y={y - 120} width="12" height="120" fill={hz('#fff6e0', 0.2)} opacity=".7" />)}
          <Building x={1010} w={200} h={230} y={y} color={hz('#d2a98a', 0.2)} seed={62} haze={0} />
          <Building x={380} w={190} h={210} y={y} color={hz('#c5967e', 0.2)} seed={63} roof="pitched" haze={0} />
        </g>
      )
    case 'khamovniki':
      return (
        <g>
          <g>
            <rect x="840" y={y - 130} width="170" height="130" fill={hz('#d9524a', 0.2)} />
            <rect x="1020" y={y - 250} width="50" height="250" fill={hz('#f1ebe0', 0.2)} />
            <path d={`M1014 ${y - 250} L1045 ${y - 320} L1076 ${y - 250} Z`} fill={hz('#3f7a62', 0.2)} />
            <Onion cx={880} cy={y - 150} r={22} c={hz('#3f9d9a', 0.2)} />
            <Onion cx={960} cy={y - 156} r={26} c={hz('#3f9d9a', 0.2)} />
          </g>
          <Building x={250} w={200} h={220} y={y} color={hz('#d0b09a', 0.2)} seed={71} haze={0} />
        </g>
      )
    case 'tverskaya':
      return (
        <g>
          <StalinTower x={760} y={y} h={330} c="#d5bfa0" haze={haze + 0.15} />
          <Building x={1000} w={240} h={290} y={y} color={hz('#cfa890', 0.2)} seed={81} roof="mansard" haze={0} />
          <Building x={220} w={260} h={250} y={y} color={hz('#b98d7d', 0.2)} seed={82} haze={0} />
        </g>
      )
    case 'city':
      return <CityTowers haze={haze} baseY={y} />
    case 'courtyard':
      return null
    default:
      return null
  }
})
