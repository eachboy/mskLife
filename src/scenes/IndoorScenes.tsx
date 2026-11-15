
import { LOCATIONS } from '../data/locations'
import { Hero } from '../features/characters/Hero'
import { SeatedFolks } from '../features/city/EntityLayer'
import { useWorldStore } from '../stores/worldStore'
import type { LocationId } from '../types'
import { mixHex } from '../utils/math'
import { SceneShell } from './SceneShell'
import Person, { HERO, randomPalette } from './art/Person'
import { PendantGlow, PendantLamp, Plant, Steam, WallClock, WindowView } from './art/InteriorKit'
import { Texture } from './art/materials'
import { Landmark } from './art/Landmarks'

const useAnchor = (): LocationId => useWorldStore((s) => s.event?.anchor ?? 'arbat')

/** Окно кофейни (координаты сцены) — для капель дождя на стекле. */
export const CAFE_GLASS = [{ x: 80, y: 112, w: 520, h: 352 }]

/** Венский стул (вид сбоку): гнутая спинка-петля, круглое сиденье, расходящиеся ножки. Сиденье на высоте Person (-44). */
function Chair({ x, y, s = 1, color = '#5a3a2c', flip = false }: { x: number; y: number; s?: number; color?: string; flip?: boolean }) {
  const dk = mixHex(color, '#140c18', 0.4)
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <ellipse cx="4" cy="2" rx="38" ry="5" fill="url(#contact)" />
      <path d="M-24 -40 L-30 0 M22 -40 L30 0" stroke={dk} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M-30 -44 Q-36 -86 -32 -112 Q-28 -124 -20 -118 Q-22 -90 -20 -46" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" />
      <path d="M-28 -60 Q-26 -84 -27 -104" fill="none" stroke={dk} strokeWidth="3" />
      <ellipse cx="0" cy="-16" rx="26" ry="3.5" fill="none" stroke={dk} strokeWidth="3" />
      <path d="M-34 -46 Q0 -50 32 -46 L32 -40 Q0 -36 -34 -40 Z" fill={color} />
      <path d="M-34 -46 Q0 -50 32 -46 L32 -44 Q0 -46 -34 -44 Z" fill="#fff" opacity=".18" />
      <path d="M-28 -40 L-36 0 M26 -40 L36 0" stroke={color} strokeWidth="5" strokeLinecap="round" />
    </g>
  )
}

/** Бистро-столик: мраморная столешница с прожилками, чугунная опора. */
function BistroTable({ x, y, s = 1, cups = 1 }: { x: number; y: number; s?: number; cups?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="4" cy="4" rx="70" ry="9" fill="url(#contact)" />
      <path d="M-34 0 Q0 -14 34 0 Z" fill="#26222c" />
      <rect x="-4" y="-68" width="8" height="62" fill="url(#dark-metal-v)" />
      <ellipse cx="0" cy="-70" rx="66" ry="11" fill="#e9e4dc" />
      <ellipse cx="0" cy="-72" rx="66" ry="10" fill="#f6f2ea" />
      <path d="M-50 -74 q20 4 34 -2 t30 4 M10 -68 q14 -4 30 2" stroke="#b8b0a6" strokeWidth=".9" fill="none" opacity=".7" />
      <path d="M-66 -70 Q0 -60 66 -70 L66 -66 Q0 -56 -66 -66 Z" fill="#bdb5aa" />
      {Array.from({ length: cups }, (_, i) => (
        <g key={i} transform={`translate(${i ? 30 : -8} -76)`}>
          <ellipse cx="0" cy="2" rx="13" ry="3" fill="#e8e2d6" />
          <path d="M-8 -12 L8 -12 L6 0 L-6 0 Z" fill="#fbf8f2" />
          <path d="M-8 -12 L8 -12 L6 0 L-6 0 Z" fill="url(#shade-x)" />
          <path d="M8 -9 q6 0 5 5 q-1 3 -6 2" stroke="#fbf8f2" strokeWidth="2" fill="none" />
          <ellipse cx="0" cy="-12" rx="8" ry="1.6" fill="#7a4a2a" />
          <Steam x={0} y={-14} n={2} />
        </g>
      ))}
    </g>
  )
}

/** Меню на грифельной доске: настоящая типографика, точки-заполнители, цены по правому краю. */
function MenuBoard({ x, y }: { x: number; y: number }) {
  const items: [string, string][][] = [
    [['Эспрессо', '160'], ['Капучино', '220'], ['Флэт уайт', '240'], ['Раф лавандовый', '290'], ['Какао', '210']],
    [['Круассан', '180'], ['Сырники', '260'], ['Медовик', '240'], ['Чай облепиховый', '230']],
  ]
  return (
    <g transform={`translate(${x} ${y})`} data-testid="cafe-menu">
      <rect x="-12" y="-12" width="404" height="248" rx="8" fill="#5a3a26" />
      <rect x="-12" y="-12" width="404" height="248" rx="8" fill="url(#shade-y)" opacity=".6" />
      <rect width="380" height="224" rx="4" fill="#25262a" />
      <rect width="380" height="224" rx="4" fill="url(#tex-grain-light)" opacity=".1" />
      <rect width="380" height="224" rx="4" fill="url(#tex-blotch-light)" opacity=".08" />
      <text x="190" y="30" fontSize="20" textAnchor="middle" fill="#f4ecdc" fontFamily="Unbounded, sans-serif" fontWeight="500" letterSpacing="3">МЕНЮ</text>
      <path d="M130 40 H250" stroke="#ffb27a" strokeWidth="1.4" opacity=".8" />
      {items.map((col, c) => (
        <g key={c} transform={`translate(${16 + c * 186} 64)`}>
          <text fontSize="10" fill="#ffb27a" fontFamily="Manrope, sans-serif" fontWeight="800" letterSpacing="1.5">{c ? 'К КОФЕ' : 'КОФЕ'}</text>
          {col.map(([n, p], i) => (
            <g key={n} transform={`translate(0 ${22 + i * 26})`}>
              <text fontSize="12.5" fill="#f4ecdc" fontFamily="Manrope, sans-serif" fontWeight="600">{n}</text>
              <path d={`M${n.length * 6.6 + 6} -2 H140`} stroke="#f4ecdc" strokeWidth="1.2" strokeDasharray="1.5 4" opacity=".4" />
              <text x="168" fontSize="12.5" textAnchor="end" fill="#f4ecdc" fontFamily="Manrope, sans-serif" fontWeight="800" style={{ fontVariantNumeric: 'tabular-nums' }}>{p}</text>
            </g>
          ))}
        </g>
      ))}
      <path d="M190 58 V210" stroke="#f4ecdc" strokeWidth="1" opacity=".18" />
    </g>
  )
}

/** Кофемашина: хромированный корпус, две группы с холдерами, паровая трубка, манометры, чашки на подогреве. */
function EspressoMachine({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="2" rx="120" ry="7" fill="url(#contact)" />
      {[-60, -36, -12, 12, 36].map((cx, i) => (
        <g key={cx} transform={`translate(${cx} -150)`}>
          <path d="M-10 0 L10 0 L8 -14 L-8 -14 Z" fill={i % 2 ? '#f6f2ea' : '#e8dcc8'} />
          <path d="M-10 0 L10 0 L8 -14 L-8 -14 Z" fill="url(#shade-x)" />
        </g>
      ))}
      <rect x="-100" y="-150" width="200" height="12" rx="3" fill="url(#brushed-v)" />
      <path d="M-104 -138 H104 L100 -20 H-100 Z" fill="url(#metal-v)" />
      <path d="M-104 -138 H104 L100 -20 H-100 Z" fill="url(#shade-y)" opacity=".5" />
      <rect x="-104" y="-138" width="208" height="30" fill="#b8342e" />
      <rect x="-104" y="-138" width="208" height="30" fill="url(#shade-y)" opacity=".5" />
      <text x="0" y="-117" fontSize="11" textAnchor="middle" fill="#fbe9d0" fontFamily="Unbounded, sans-serif" fontWeight="500" letterSpacing="3">ESPRESSO</text>
      {[-24, 24].map((gx) => (
        <g key={gx} transform={`translate(${gx} -86)`}>
          <circle r="11" fill="#f4f1e8" stroke="url(#brass-v)" strokeWidth="3" />
          <path d="M0 0 L5 -6" stroke="#c8323a" strokeWidth="1.6" />
        </g>
      ))}
      {[-58, 58].map((gx) => (
        <g key={gx} transform={`translate(${gx} -58)`}>
          <rect x="-16" y="-8" width="32" height="14" rx="3" fill="url(#brushed-v)" />
          <rect x="-12" y="6" width="24" height="9" rx="2" fill="#2a2830" />
          <path d={`M${gx > 0 ? 10 : -10} 10 L${gx > 0 ? 40 : -40} 14`} stroke="#1c1a20" strokeWidth="6" strokeLinecap="round" />
        </g>
      ))}
      <path d="M96 -70 Q114 -66 112 -30" stroke="url(#metal-v)" strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="-100" y="-28" width="200" height="10" rx="2" fill="url(#pat-grille)" />
      <rect x="-100" y="-28" width="200" height="10" rx="2" fill="#2a2830" opacity=".4" />
      <g transform="translate(-58 -30)">
        <path d="M-8 0 L8 0 L6 -12 L-6 -12 Z" fill="#fbf8f2" />
      </g>
      <Steam x={112} y={-34} n={2} />
      <path d="M-90 -104 L-74 -104 L-80 -24 L-94 -24 Z" fill="#fff" opacity=".35" />
    </g>
  )
}

/** Витрина с выпечкой: стеклянный короб с отражениями, круассаны и пирожные на подносах. */
function PastryCase({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-90" y="-8" width="180" height="8" fill="#2a2228" />
      {[-60, -24, 12, 48].map((px, i) => (
        <g key={px} transform={`translate(${px} -16)`}>
          <ellipse cx="0" cy="4" rx="16" ry="3" fill="#c9b8a0" />
          {i % 2 ? (
            <g>
              <path d="M-14 2 Q-10 -12 0 -13 Q10 -12 14 2 Z" fill="#d89a4a" />
              <path d="M-8 -8 Q0 -2 8 -8 M-12 -2 Q0 4 12 -2" stroke="#9a5a22" strokeWidth="1.4" fill="none" />
            </g>
          ) : (
            <g>
              <rect x="-11" y="-12" width="22" height="14" rx="2" fill="#f2e2cc" />
              <rect x="-11" y="-12" width="22" height="5" rx="2" fill="#8a4a3a" />
              <circle cx="0" cy="-14" r="3" fill="#d9322a" />
            </g>
          )}
        </g>
      ))}
      {[-60, -24, 12, 48].map((px) => (
        <g key={`b${px}`} transform={`translate(${px} -52)`}>
          <path d="M-12 2 Q-8 -10 0 -10 Q8 -10 12 2 Z" fill="#c98a3a" />
        </g>
      ))}
      <rect x="-86" y="-46" width="172" height="3" fill="#d8d0c4" opacity=".7" />
      <path d="M-90 -8 L-90 -86 Q-90 -96 -80 -96 L80 -96 Q90 -96 90 -86 L90 -8 Z" fill="url(#glass-day)" opacity=".18" />
      <path d="M-90 -8 L-90 -86 Q-90 -96 -80 -96 L80 -96 Q90 -96 90 -86 L90 -8" fill="none" stroke="#e8e4dc" strokeWidth="2" opacity=".7" />
      <path d="M-70 -92 L-50 -92 L-80 -12 L-88 -12 Z" fill="#fff" opacity=".22" />
      <path d="M40 -92 L50 -92 L30 -12 L22 -12 Z" fill="#fff" opacity=".12" />
    </g>
  )
}

// ═══════════ Кофейня / магазин ═══════════
const T1 = { x: 330, y: 778 }
const T2 = { x: 760, y: 800 }

export function CafeScene({ locId }: { locId: LocationId }) {
  const anchor = useAnchor()
  const shop = locId === 'shop'
  const event = useWorldStore((s) => s.event)
  const bar = randomPalette(() => 0.31)
  const heroSits = !shop && (event?.kind === 'lunch' || event?.kind === 'cafe' || event?.pose === 'drink' || event?.pose === 'sit')
  const wall = shop ? '#c9a58a' : '#a9654e'
  const lamps: [number, number][] = shop ? [[400, 190], [760, 170], [1100, 140]] : [[400, 190], [760, 170], [1010, 330]]
  const art = (
    <>
      {/* ── стена: кирпич (фактура + неравномерность), деревянные панели внизу ── */}
      <rect x="-50" y="0" width="1700" height="910" fill={wall} />
      {!shop && <rect x="-50" y="0" width="1700" height="610" fill="url(#pat-brick)" />}
      <Texture x={-50} y={0} w={1700} h={610} grain={0.35} blotch={0.45} light={0.25} />
      <rect x="-50" y="0" width="1700" height="140" fill="url(#ao-down)" opacity=".5" />
      <rect x="-50" y="470" width="1700" height="140" fill="#5a3826" />
      <rect x="-50" y="470" width="1700" height="140" fill="url(#pat-planks)" opacity=".5" />
      {Array.from({ length: 18 }, (_, i) => <rect key={i} x={-50 + i * 96} y="478" width="88" height="122" rx="3" fill="none" stroke="#3a2418" strokeWidth="2" opacity=".55" />)}
      <rect x="-50" y="466" width="1700" height="8" fill="#7a5038" />
      <rect x="-50" y="604" width="1700" height="8" fill="#3a2418" />
      {/* ── пол: дубовые доски, отражения ламп ── */}
      <rect x="-50" y="610" width="1700" height="300" fill="#7a5238" />
      <rect x="-50" y="610" width="1700" height="300" fill="url(#pat-planks)" />
      <rect x="-50" y="610" width="1700" height="300" fill="url(#tex-grain)" opacity=".35" />
      <rect x="-50" y="610" width="1700" height="300" fill="url(#tex-streak)" opacity=".18" />
      <rect x="-50" y="610" width="1700" height="40" fill="url(#ao-down)" opacity=".6" />
      {/* ── окно на улицу ── */}
      <WindowView x={80} y={112} w={520} h={352} anchor={anchor} frame="#3a2a22" mullions={2} />
      <rect x="56" y="462" width="568" height="20" rx="3" fill="#6a4632" />
      <rect x="56" y="462" width="568" height="6" rx="3" fill="#9a6a4a" />
      <rect x="56" y="482" width="568" height="12" fill="url(#ao-down)" opacity=".6" />
      <Plant x={570} y={462} s={0.9} />
      <g transform="translate(150 462)">
        <rect x="-14" y="-30" width="28" height="30" rx="4" fill="#e8dcc8" />
        <rect x="-14" y="-30" width="28" height="30" rx="4" fill="url(#shade-x)" />
        <path d="M-6 -30 Q-10 -60 -4 -70 M4 -30 Q10 -54 6 -64" stroke="#5a8a4a" strokeWidth="3" fill="none" />
        <circle cx="-4" cy="-72" r="6" fill="#f2c14e" />
        <circle cx="6" cy="-66" r="5" fill="#e0526a" />
      </g>
      {shop ? (
        <g>
          {[0, 1].map((i) => (
            <g key={i} transform={`translate(${760 + i * 400} 150)`}>
              <rect width="360" height="400" fill="#7a4f3a" />
              <rect width="360" height="400" fill="url(#shade-x)" opacity=".6" />
              {[0, 1, 2, 3].map((r) => (
                <g key={r}>
                  <rect x="8" y={r * 98 + 92} width="344" height="8" fill="#5a3a2a" />
                  {Array.from({ length: 13 }, (_, k) => (
                    <rect key={k} x={14 + k * 26} y={r * 98 + 10 + ((k * 7) % 14)} width="20" height={80 - ((k * 7) % 14)} rx="2" fill={['#e0526a', '#3f9d9a', '#f2c14e', '#8f5fa8', '#5c6bc0', '#e8d5b0'][(k + r) % 6]} />
                  ))}
                  <rect x="8" y={r * 98 + 10} width="344" height="82" fill="url(#shade-y)" opacity=".35" />
                </g>
              ))}
            </g>
          ))}
          <g transform="translate(1520 220)">
            <rect x="-40" y="0" width="80" height="150" fill="#f3ecdf" />
            {[0, 1, 2].map((i) => <rect key={i} x="-30" y={10 + i * 44} width="60" height="34" fill={['#ffb3c1', '#b3d9ff', '#ffe3a0'][i]} />)}
          </g>
        </g>
      ) : (
        <g>
          <MenuBoard x={790} y={78} />
          {/* неоновая вывеска на кирпиче */}
          <g transform="translate(1360 120)">
            <text x="0" y="0" fontSize="40" textAnchor="middle" fill="none" stroke="#ff9a6a" strokeWidth="2.4" fontFamily="Unbounded, sans-serif" fontWeight="500" className="neon">кофе</text>
            <text x="0" y="28" fontSize="13" textAnchor="middle" fill="#ffd9b8" fontFamily="Manrope, sans-serif" fontWeight="700" letterSpacing="4" opacity=".8">С 8:00</text>
          </g>
          <WallClock x={1528} y={100} r={34} />
          {/* полки с банками зерна и посудой */}
          {[236, 330].map((sy, r) => (
            <g key={sy}>
              <rect x="1216" y={sy} width="360" height="10" fill="#4a2e20" />
              <rect x="1216" y={sy + 10} width="360" height="8" fill="url(#ao-down)" opacity=".6" />
              {Array.from({ length: 8 }, (_, i) => {
                const jx = 1230 + i * 42
                return r === 0 ? (
                  <g key={i}>
                    <rect x={jx} y={sy - 52} width="30" height="52" rx="5" fill="#d8e4ea" opacity=".55" />
                    <rect x={jx + 2} y={sy - 34} width="26" height="34" rx="4" fill={['#5a3420', '#7a4a2a', '#3a2216'][i % 3]} />
                    <rect x={jx - 1} y={sy - 58} width="32" height="8" rx="2" fill="#2a2228" />
                    <rect x={jx + 4} y={sy - 48} width="4" height="40" fill="#fff" opacity=".35" />
                  </g>
                ) : (
                  <g key={i}>
                    <path d={`M${jx} ${sy} L${jx + 2} ${sy - 30} H${jx + 28} L${jx + 30} ${sy} Z`} fill={['#f3ecdf', '#c9a77a', '#e8d5b0', '#8a9a8a'][i % 4]} />
                    <path d={`M${jx} ${sy} L${jx + 2} ${sy - 30} H${jx + 28} L${jx + 30} ${sy} Z`} fill="url(#shade-x)" />
                  </g>
                )
              })}
            </g>
          ))}
          {/* бариста стоит на полу ЗА стойкой: стойка закрывает ноги; тёмный фартук */}
          <g transform="translate(1112 640)"><Person pose="stand" facing={-1} palette={{ ...bar, coat: '#2f3a52', hairStyle: 'bun', topColor: '#ece4d6' }} scale={1.3} look={{ coat: 'light' }} /></g>
          <g transform="translate(1112 640) scale(1.3)"><path d="M-12 -96 L12 -96 L15 -48 L-15 -48 Z" fill="#3a2a22" opacity=".9" /></g>
          {/* ── стойка: рифлёный деревянный фасад, мраморная столешница, латунная подножка ── */}
          <rect x="860" y="556" width="780" height="214" fill="#4a2e22" />
          {Array.from({ length: 32 }, (_, i) => <rect key={i} x={868 + i * 24} y="572" width="14" height="184" rx="7" fill="#5e3a2a" />)}
          <rect x="860" y="556" width="780" height="214" fill="url(#shade-y)" opacity=".7" />
          <rect x="860" y="556" width="780" height="22" fill="url(#ao-down)" opacity=".8" />
          <rect x="840" y="536" width="820" height="22" rx="4" fill="#ece8e0" />
          <rect x="840" y="536" width="820" height="7" rx="3" fill="#fff" opacity=".6" />
          <path d="M880 548 q40 -4 80 2 t90 -2 M1300 546 q60 4 120 -2" stroke="#b8b0a6" strokeWidth="1" fill="none" opacity=".7" />
          <rect x="840" y="556" width="820" height="5" fill="#9a928a" />
          <rect x="870" y="736" width="770" height="8" rx="4" fill="url(#brass-v)" />
          {[920, 1180, 1440].map((x) => <rect key={x} x={x} y="742" width="6" height="26" fill="url(#brass-v)" />)}
          <rect x="860" y="768" width="780" height="10" fill="url(#ao-up)" opacity=".7" />
          <PastryCase x={980} y={536} />
          <EspressoMachine x={1260} y={536} />
          {/* кофемолка */}
          <g transform="translate(1440 536)">
            <rect x="-18" y="-60" width="36" height="60" rx="6" fill="#2a2830" />
            <rect x="-18" y="-60" width="36" height="60" rx="6" fill="url(#shade-x)" />
            <path d="M-20 -60 L-14 -104 H14 L20 -60 Z" fill="#c8d4dc" opacity=".55" />
            <path d="M-12 -70 L-8 -100 H8 L12 -70 Z" fill="#4a2a18" />
          </g>
          {/* терминал оплаты, стакан с трубочками */}
          <g transform="translate(1540 536)">
            <rect x="-16" y="-34" width="32" height="34" rx="4" fill="#1c1c22" />
            <rect x="-12" y="-30" width="24" height="16" rx="2" fill="#7fd0ff" opacity=".8" />
          </g>
          <g transform="translate(900 536)"><path d="M-14 0 L-18 -40 H18 L14 0 Z" fill="#f3ecdf" opacity=".92" /><rect x="-18" y="-44" width="36" height="6" rx="3" fill="#6b4a3a" /></g>
        </g>
      )}
      {lamps.map(([x, len]) => <PendantLamp key={x} x={x} y={0} len={len} />)}

      {/* ── столики и посетители ── */}
      {!shop && (
        <g>
          {/* пара за дальним столиком: сидят лицом друг к другу */}
          <Chair x={T1.x - 110} y={T1.y} s={1.1} />
          <Chair x={T1.x + 110} y={T1.y} s={1.1} flip />
          <SeatedFolks items={[{ x: T1.x - 110, y: T1.y, s: 1.1, seed: 141, pose: 'drink', seated: true }, { x: T1.x + 110, y: T1.y, s: 1.1, seed: 58, flip: true, pose: 'read' }]} />
          <BistroTable x={T1.x} y={T1.y + 4} s={1.1} cups={2} />
          <BistroTable x={T2.x} y={T2.y + 4} s={1.1} cups={heroSits ? 1 : 0} />
          {/* гость у стойки с телефоном */}
          <SeatedFolks items={[{ x: 1500, y: 800, s: 1.12, seed: 77, flip: true, pose: 'phone' }]} />
        </g>
      )}
      {heroSits && <Chair x={T2.x - 110} y={T2.y} s={1.1} />}
      <Hero
        place={
          shop
            ? { x: 960, y: 786, s: 1.12, pose: 'stand', indoor: true, facing: 1 }
            : heroSits
              ? { x: T2.x - 110, y: T2.y, s: 1.1, pose: event?.pose === 'sit' ? 'sit' : 'drink', seated: true, indoor: true, facing: 1 }
              : { x: T2.x - 150, y: T2.y + 10, s: 1.12, pose: 'drink', indoor: true, facing: 1 }
        }
      />
    </>
  )
  const lights = (
    <>
      {lamps.map(([x, len]) => <PendantGlow key={x} x={x} y={0} len={len} r={len > 250 ? 220 : 170} />)}
      {/* дневной свет из окна: косой луч на пол и столик */}
      <g className="day-only">
        <path d="M80 464 L600 464 L900 900 L240 900 Z" fill="#ffe2b8" opacity=".12" style={{ mixBlendMode: 'screen' }} />
      </g>
      {/* лужицы света под лампами на столах и стойке */}
      <g className="lamp-lit">
        {(shop ? [] : [T1, T2]).map((t) => <ellipse key={t.x} cx={t.x} cy={t.y - 70} rx="160" ry="48" fill="url(#glow-warm)" opacity=".5" style={{ mixBlendMode: 'screen' }} />)}
        <ellipse cx="1180" cy="540" rx="320" ry="40" fill="url(#glow-warm)" opacity=".5" style={{ mixBlendMode: 'screen' }} />
      </g>
      {!shop && <ellipse cx="1360" cy="108" rx="140" ry="50" fill="url(#glow-warm)" opacity=".55" style={{ mixBlendMode: 'screen' }} />}
    </>
  )
  const bloom = (
    <>
      {lamps.map(([x, len]) => <ellipse key={x} cx={x} cy={len + 24} rx="22" ry="7" fill="#ffe2b0" />)}
      {!shop && <text x="1360" y="120" fontSize="40" textAnchor="middle" fill="none" stroke="#ff9a6a" strokeWidth="5" fontFamily="Unbounded, sans-serif" fontWeight="500">кофе</text>}
    </>
  )
  return <SceneShell art={art} lights={lights} bloom={bloom} />
}

// ═══════════ Офис ═══════════
export function OfficeScene() {
  const sky = LOCATIONS['moscow-city'].theme
  const art = (
    <>
      <rect x="-50" y="0" width="1700" height="910" fill="#d9d6e0" />
      <Texture x={-50} y={0} w={1700} h={640} grain={0.3} blotch={0.3} light={0.2} />
      {/* акустические панели на стене справа */}
      {Array.from({ length: 6 }, (_, i) => <rect key={i} x={1090 + i * 86} y="40" width="78" height="200" rx="4" fill="#c9c4d2" />)}
      {Array.from({ length: 6 }, (_, i) => <rect key={`s${i}`} x={1090 + i * 86} y="40" width="78" height="200" rx="4" fill="url(#shade-y)" opacity=".5" />)}
      {/* панорамное окно */}
      <clipPath id="off-win"><rect x="40" y="70" width="980" height="560" /></clipPath>
      <rect x="40" y="70" width="980" height="560" fill="url(#sky)" />
      <g clipPath="url(#off-win)">
        <g transform="translate(-120 130) scale(0.95)"><Landmark theme={sky} baseY={620} haze={0.1} /></g>
        <rect x="40" y="590" width="980" height="60" fill="#4a4e66" />
        <path d="M60 80 L420 630 H300 L60 200Z" fill="#fff" opacity=".05" />
      </g>
      {/* отражение офиса в стекле (сильнее вечером) */}
      <g style={{ opacity: 'calc(0.15 + var(--night) * 0.5)' }}>
        <rect x="60" y="520" width="900" height="6" fill="#fff6e0" opacity=".25" />
        <path d="M560 630 L560 560 L830 560 L830 630 Z" fill="#9fe3ff" opacity=".08" />
      </g>
      {[330, 660].map((x) => <rect key={x} x={x - 2} y="64" width="12" height="572" fill="url(#brushed-v)" />)}
      <rect x="34" y="64" width="992" height="572" fill="none" stroke="#6e7388" strokeWidth="14" />
      <rect x="27" y="57" width="1006" height="4" fill="#fff" opacity=".25" />
      {/* пол */}
      <rect x="-50" y="640" width="1700" height="270" fill="#7e7890" />
      <rect x="-50" y="640" width="1700" height="270" fill="url(#pat-paving)" opacity=".8" />
      <rect x="-50" y="640" width="1700" height="270" fill="url(#tex-grain)" opacity=".4" />
      <rect x="-50" y="640" width="1700" height="270" fill="url(#tex-streak)" opacity=".12" />
      <rect x="-50" y="640" width="1700" height="40" fill="url(#ao-down)" opacity=".5" />
      <rect x="-50" y="634" width="1700" height="12" fill="#6a6580" />
      <WallClock x={1300} y={170} r={42} />
      {/* доска */}
      <rect x="1120" y="270" width="400" height="230" rx="6" fill="#f3f1ec" stroke="#8a8499" strokeWidth="8" />
      {[0, 1, 2].map((i) => <rect key={i} x={1150 + i * 120} y={300} width="100" height="64" fill={['#ffe3a0', '#ffb3c1', '#b3e0ff'][i]} />)}
      <path d="M1150 400 q60 -40 120 0 t120 0" stroke="#3f9d9a" strokeWidth="5" fill="none" />
      {/* дальний стол коллеги: стул + стол, коллега сидит на стуле */}
      <g opacity=".9">
        <Chair x={1186} y={640} s={0.75} color="#4a4568" />
        <g transform="translate(1190 640)"><Person pose="type" palette={randomPalette(() => 0.7)} look={{ coat: 'light' }} scale={0.75} /></g>
        <rect x="1262" y="536" width="66" height="42" rx="4" fill="#2a2a3a" />
        <rect x="1266" y="540" width="58" height="34" rx="3" fill="#9fe3ff" opacity=".55" />
        <rect x="1206" y="576" width="140" height="8" rx="3" fill="#b8a080" />
        <rect x="1214" y="584" width="5" height="56" fill="#3a3550" />
        <rect x="1334" y="584" width="5" height="56" fill="#3a3550" />
      </g>
      {/* кресло героя (за столом) */}
      <g transform="translate(478 785) scale(1.18)">
        <ellipse cx="0" cy="2" rx="46" ry="6" fill="#2a2a3a" />
        <rect x="-4" y="-40" width="9" height="40" fill="#2a2a3a" />
        <rect x="-36" y="-50" width="78" height="12" rx="6" fill="#4a4568" />
        <rect x="-44" y="-150" width="22" height="104" rx="10" fill="#3a3550" />
      </g>
      {/* стол героя */}
      <g transform="translate(0 -26)">
        <ellipse cx="640" cy="812" rx="360" ry="18" fill="rgba(10,6,30,.22)" />
        <rect x="260" y="716" width="720" height="22" rx="6" fill="#c9a77a" />
        <rect x="260" y="716" width="720" height="22" rx="6" fill="url(#pat-planks)" opacity=".5" />
        <rect x="260" y="716" width="720" height="5" rx="2" fill="#fff" opacity=".3" />
        <rect x="260" y="734" width="720" height="4" fill="#000" opacity=".2" />
        <rect x="290" y="738" width="12" height="74" fill="#3a3550" />
        <rect x="940" y="738" width="12" height="74" fill="#3a3550" />
        {/* монитор */}
        <rect x="560" y="570" width="270" height="146" rx="10" fill="#2a2a3a" />
        <rect x="560" y="570" width="270" height="146" rx="10" fill="url(#shade-x)" opacity=".6" />
        <rect x="570" y="580" width="250" height="124" rx="6" fill="#2d4a6a" />
        <rect x="570" y="580" width="250" height="124" rx="6" fill="#9fe3ff" opacity=".25" className="flicker" />
        {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={586} y={596 + i * 20} width={90 + ((i * 53) % 120)} height="8" rx="4" fill="#ffd27a" opacity=".8" />)}
        <rect x="684" y="716" width="42" height="12" fill="#2a2a3a" />
        {/* лампа и кружка */}
        <path d="M900 716 V620 L850 600" stroke="#3a3550" strokeWidth="6" fill="none" />
        <rect x="826" y="590" width="40" height="14" rx="5" fill="#ffb870" />
        <rect x="360" y="692" width="30" height="24" rx="4" fill="#f3ecdf" />
        <Steam x={375} y={690} n={2} />
      </g>
      <Hero place={{ x: 478, y: 785, s: 1.18, pose: 'type', indoor: true }} />
      <Plant x={1500} y={760} s={1.3} />
    </>
  )
  const lights = (
    <>
      <path d="M80 640 L760 640 L1020 900 L-120 900 Z" fill="#ffb36b" style={{ mixBlendMode: 'screen', opacity: 'calc(0.08 + var(--golden) * 0.25)' }} />
      <path d="M40 70 L1020 70 L1020 630 L40 630 Z" fill="#ffb36b" style={{ mixBlendMode: 'screen', opacity: 'calc(var(--golden) * 0.1)' }} />
      <circle cx="858" cy="574" r="200" fill="url(#glow-warm)" opacity=".35" className="lamp-lit" style={{ mixBlendMode: 'screen' }} />
      <circle cx="700" cy="614" r="260" fill="url(#glow-cool)" opacity=".28" style={{ mixBlendMode: 'screen' }} />
    </>
  )
  const bloom = (
    <>
      <rect x="570" y="554" width="250" height="124" rx="6" fill="#9fe3ff" opacity=".5" />
      <g className="lamp-lit"><rect x="826" y="564" width="40" height="14" rx="5" fill="#ffd9a0" /></g>
    </>
  )
  return <SceneShell art={art} lights={lights} bloom={bloom} />
}

// ═══════════ Дом ═══════════
export function HomeScene() {
  const event = useWorldStore((s) => s.event)
  const kind = event?.kind ?? 'wake'
  const asleep = kind === 'sleep'
  const reading = kind === 'home-night'
  const wall = mixHex('#c79a7e', '#8a6a8a', 0.2)
  const art = (
    <>
      <rect x="-50" y="0" width="1700" height="910" fill={wall} />
      {/* обои: тонкая вертикальная полоса + фактура штукатурки */}
      {Array.from({ length: 40 }, (_, i) => <rect key={i} x={-50 + i * 44} y="0" width="2" height="640" fill="#fff" opacity=".05" />)}
      <Texture x={-50} y={0} w={1700} h={640} grain={0.3} blotch={0.4} light={0.25} />
      <rect x="-50" y="0" width="1700" height="120" fill="url(#ao-down)" opacity=".45" />
      <rect x="-50" y="640" width="1700" height="270" fill="#8a5f44" />
      <rect x="-50" y="640" width="1700" height="270" fill="url(#pat-planks)" />
      <rect x="-50" y="640" width="1700" height="270" fill="url(#tex-grain)" opacity=".35" />
      <rect x="-50" y="640" width="1700" height="270" fill="url(#tex-streak)" opacity=".15" />
      <rect x="-50" y="646" width="1700" height="36" fill="url(#ao-down)" opacity=".55" />
      <rect x="-50" y="634" width="1700" height="14" fill="#5a3a2c" />
      {/* окно во двор */}
      <WindowView x={980} y={110} w={440} h={400} anchor="courtyard" mullions={1} frame="#f3ecdf" />
      <rect x="940" y="88" width="520" height="8" rx="4" fill="url(#brass-v)" />
      <path d="M960 100 Q1010 300 975 530 L1060 530 Q1040 300 1080 100Z" fill="#e8a0a8" opacity=".85" />
      <path d="M1440 100 Q1390 300 1425 530 L1340 530 Q1360 300 1320 100Z" fill="#e8a0a8" opacity=".85" />
      {/* складки штор */}
      <path d="M990 110 Q1020 300 998 520 M1030 110 Q1040 300 1030 520 M1410 110 Q1380 300 1402 520 M1370 110 Q1360 300 1370 520" stroke="#b86a78" strokeWidth="5" fill="none" opacity=".45" />
      {/* полка с книгами и постеры */}
      <rect x="120" y="180" width="360" height="10" fill="#5a3a2c" />
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={128 + i * 28} y={140 + ((i * 7) % 12)} width="22" height={40 - ((i * 7) % 12)} rx="2" fill={['#e0526a', '#3f9d9a', '#f2c14e', '#8f5fa8', '#5c6bc0'][i % 5]} />)}
      <rect x="150" y="260" width="140" height="190" rx="4" fill="#f3ecdf" stroke="#5a3a2c" strokeWidth="8" />
      <path d="M160 440 L220 330 L260 390 L290 360 V440Z" fill="#3f9d9a" />
      <circle cx="250" cy="300" r="22" fill="#ffd36b" />
      <rect x="320" y="290" width="120" height="150" rx="4" fill="#f3ecdf" stroke="#5a3a2c" strokeWidth="8" />
      <path d="M330 300 H430 M330 330 H410 M330 360 H430" stroke="#b08a60" strokeWidth="4" />
      <WallClock x={700} y={170} r={34} />
      {/* кровать */}
      <g transform="translate(160 0)">
        <ellipse cx="250" cy="706" rx="300" ry="14" fill="url(#contact)" />
        {/* изголовье: мягкая панель на деревянной раме */}
        <path d="M-46 704 V500 Q-46 470 -16 470 H-4 Q8 470 8 500 V704 Z" fill="#5a3a2c" />
        <path d="M-40 640 V506 Q-40 480 -18 480 H-8 Q2 480 2 506 V640 Z" fill="#8a5a6a" />
        <path d="M-40 640 V506 Q-40 480 -18 480 H-8 Q2 480 2 506 V640 Z" fill="url(#pat-moquette)" />
        <path d="M-46 704 V500 Q-46 470 -16 470 H-4 Q8 470 8 500 V704 Z" fill="url(#shade-x)" opacity=".6" />
        {/* основание и ножки */}
        <rect x="-4" y="676" width="510" height="20" rx="4" fill="#5a3a2c" />
        <rect x="-4" y="676" width="510" height="20" rx="4" fill="url(#shade-y)" />
        <rect x="490" y="690" width="12" height="16" fill="#3a2418" />
        <rect x="490" y="640" width="16" height="50" rx="4" fill="#5a3a2c" />
        <rect x="0" y="600" width="500" height="80" rx="14" fill="#f3ecdf" />
        <rect x="0" y="600" width="500" height="80" rx="14" fill="url(#shade-y)" />
        <path d="M60 640 q40 -6 80 2 M200 650 q60 -8 120 0 M360 636 q40 4 90 -2" stroke="#c9bfae" strokeWidth="2" fill="none" />
        <rect x="0" y="596" width="500" height="34" rx="12" fill="#e0526a" opacity={asleep ? 0 : 1} />
        <rect x="0" y="596" width="500" height="34" rx="12" fill="url(#pat-moquette)" opacity={asleep ? 0 : 0.8} />
        <rect x="14" y="570" width="100" height="40" rx="18" fill="#fff" />
        <rect x="14" y="570" width="100" height="40" rx="18" fill="url(#shade-y)" />
      </g>
      {/* кресло для чтения: спинка справа — героиня сидит к ней спиной, лицом влево */}
      <g transform="translate(1150 700)">
        <ellipse cx="0" cy="12" rx="124" ry="10" fill="url(#contact)" />
        <rect x="-110" y="-60" width="220" height="70" rx="26" fill="#3f9d9a" />
        <rect x="-110" y="-60" width="220" height="70" rx="26" fill="url(#pat-moquette)" />
        <rect x="-110" y="-60" width="220" height="70" rx="26" fill="url(#shade-y)" />
        <rect x="56" y="-150" width="62" height="160" rx="26" fill="#37888a" />
        <rect x="56" y="-150" width="62" height="160" rx="26" fill="url(#pat-moquette)" />
        <rect x="56" y="-150" width="62" height="160" rx="26" fill="url(#shade-x)" />
      </g>
      {/* ковёр + лампа */}
      <ellipse cx="800" cy="840" rx="520" ry="46" fill="#a05a6a" opacity=".55" />
      <ellipse cx="800" cy="840" rx="520" ry="46" fill="url(#pat-moquette)" opacity=".6" />
      <ellipse cx="800" cy="840" rx="480" ry="38" fill="none" stroke="#e8c0a0" strokeWidth="3" opacity=".35" strokeDasharray="10 8" />
      <g transform="translate(1420 650)">
        <rect x="-4" y="-170" width="8" height="170" fill="#3a3550" />
        <path d="M-34 -170 Q0 -218 34 -170 Z" fill="#ffd9a0" />
      </g>
      <Plant x={590} y={640} s={1.1} />

      {/* герой */}
      {asleep ? (
        <g transform="translate(300 640)">
          <g>
            <circle cx="-10" cy="-18" r="21" fill={HERO.skin} />
            <path d="M-32 -22 Q-12 -50 12 -26 L12 4 L-32 4 Z" fill={HERO.hair} />
            <path d="M-120 20 Q-60 -34 130 -22 L380 -10 L380 36 L-120 36 Z" fill="#e0526a" transform="translate(-40 -16)" />
          </g>
          {[0, 1, 2].map((i) => <text key={i} x={40 + i * 20} y={-60 - i * 16} fontSize={16 + i * 4} fill="#fff" opacity="0" fontFamily="Unbounded, sans-serif" style={{ animation: `zzz 3.4s ${i * 1.1}s ease-out infinite` }}>z</text>)}
        </g>
      ) : reading ? (
        <Hero place={{ x: 1172, y: 692, s: 1.1, pose: 'read', indoor: true, facing: -1 }} />
      ) : (
        <Hero place={{ x: 880, y: 785, s: 1.22, pose: 'drink', indoor: true, facing: 1 }} />
      )}
    </>
  )
  const lights = (
    <>
      <circle cx="1420" cy="480" r="350" fill="url(#glow-warm)" opacity=".3" style={{ mixBlendMode: 'screen' }} />
      <circle cx="1420" cy="480" r="180" fill="url(#glow-warm)" opacity=".35" style={{ mixBlendMode: 'screen' }} />
      <g className="lamp-lit"><circle cx="1200" cy="500" r="420" fill="url(#glow-warm)" opacity=".2" style={{ mixBlendMode: 'screen' }} /></g>
    </>
  )
  const bloom = <path d="M1386 480 Q1420 432 1454 480 Z" fill="#ffe2b0" />
  return <SceneShell art={art} lights={lights} bloom={bloom} />
}
