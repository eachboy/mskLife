import { memo, type RefObject, useEffect, useMemo, useRef } from 'react'
import { LOCATIONS } from '../data/locations'
import { Hero, type HeroPlace } from '../features/characters/Hero'
import { SeatedFolks } from '../features/city/EntityLayer'
import { useWorldStore } from '../stores/worldStore'
import type { LocationId, Season, TravelPhase } from '../types'
import { fmtTime, mixHex, mulberry32 } from '../utils/math'
import Person, { HERO, randomPalette } from './art/Person'
import { Landmark } from './art/Landmarks'
import { Texture } from './art/materials'
import { Building, Lamp, LampGlow, Stars, Tree } from './art/primitives'
import { PanPlane, SceneShell } from './SceneShell'

/**
 * Салоны наземного транспорта: автобус (вид на борт, пассажиры лицом к камере) и такси (вид с заднего сиденья).
 * Город за окнами — PanPlane (едет div → композитор). Остановки (светофор, посадка) — data-stopped/data-door
 * на обёртке: CSS ставит панораму на паузу, зажигает стоп-сигналы и складывает двери. React не перерисовывается.
 */

type Rect = { x: number; y: number; w: number; h: number }

const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`

// ═════════════════════ цикл движения / остановок ═════════════════════

type RideState = 'run' | 'stop' | 'board'

/**
 * Пишет data-stopped / data-door на обёртку. 'run' — едем с периодическими остановками
 * (светофоры/остановки по пути), 'stop' — стоим с закрытыми дверями, 'board' — двери открыты.
 */
function useRideCycle(ref: RefObject<HTMLDivElement | null>, state: RideState, cycle: { run: number; stop: number; door: boolean }) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const set = (stopped: boolean, door: boolean) => {
      el.dataset.stopped = stopped ? '1' : '0'
      el.dataset.door = door ? '1' : '0'
    }
    if (state !== 'run') {
      set(true, state === 'board')
      return
    }
    set(false, false)
    // одновременно живут не больше трёх таймеров — массив пересоздаётся каждый цикл (без роста за долгую поездку)
    let timers: number[] = []
    const later = (fn: () => void, sec: number) => timers.push(window.setTimeout(fn, sec * 1000))
    const loop = () => {
      timers = []
      // стоим stop секунд; двери (если это остановка) открыты в середине стоянки
      set(true, false)
      if (cycle.door) {
        later(() => set(true, true), 1.3)
        later(() => set(true, false), cycle.stop - 1.8)
      }
      later(() => {
        set(false, false)
        timers = []
        later(loop, cycle.run)
      }, cycle.stop)
    }
    later(loop, cycle.run)
    return () => {
      for (const id of timers) window.clearTimeout(id)
    }
  }, [ref, state, cycle.run, cycle.stop, cycle.door])
}

const useEvent = () => useWorldStore((s) => s.event)

// ═════════════════════ АВТОБУС ═════════════════════
// Камера у прохода, смотрит на правый борт: окна, двери, сиденья вдоль борта (пассажиры лицом к камере).
const CEIL_B = 214
const WIN_T = 250
const WIN_B = 560
const FLOOR_Y = 706
const FEET = 748
const SEAT_S = 1.75
const BUS_DOOR = { x: 1062, w: 250, top: 236 }
const BUS_WINDOWS: [number, number][] = [[-60, 300], [322, 690], [712, 1012], [1360, 1660]]
const BUS_SEATS = [118, 214, 310, 406, 1414, 1510]
const POLES = [470, 760, 1036, 1338]
const VALIDATOR = { x: 1036, y: 540 }

/** Стёкла салона в координатах сцены 1600×900 (для капель дождя на стекле). */
export const BUS_GLASS: Rect[] = [
  ...BUS_WINDOWS.map(([a, b]) => ({ x: Math.max(0, a), y: WIN_T, w: Math.min(1600, b) - Math.max(0, a), h: WIN_B - WIN_T })),
  { x: BUS_DOOR.x + 14, y: BUS_DOOR.top + 16, w: BUS_DOOR.w - 28, h: 420 },
]

const BUS_WALL_D = (() => {
  let d = `M-60 ${CEIL_B}H1660V${FLOOR_Y + 2}H-60Z`
  for (const [a, b] of BUS_WINDOWS) d += rr(a, WIN_T, b - a, WIN_B - WIN_T, 22)
  d += `M${BUS_DOOR.x} ${BUS_DOOR.top}H${BUS_DOOR.x + BUS_DOOR.w}V${FLOOR_Y + 2}H${BUS_DOOR.x}Z`
  return d
})()

/** Средний план за окном: фасады вдоль улицы (период 1600). */
const BusCityMid = memo(function BusCityMid({ anchor }: { anchor: LocationId }) {
  const theme = LOCATIONS[anchor].theme
  const rng = mulberry32(anchor.length * 31 + 7)
  const items: { x: number; w: number; h: number; facade: 'classic' | 'stalin' | 'modern' | 'panel' | 'brick'; roof: 'flat' | 'pitched' | 'mansard' }[] = []
  let x = 0
  while (x < 1600) {
    const w = 170 + Math.floor(rng() * 90)
    const ww = Math.min(w, 1600 - x)
    if (ww < 60) break
    items.push({
      x, w: ww, h: 260 + Math.floor(rng() * 180),
      facade: (['classic', 'stalin', 'brick', 'classic', 'panel'] as const)[Math.floor(rng() * 5)],
      roof: (['flat', 'pitched', 'mansard'] as const)[Math.floor(rng() * 3)],
    })
    x += ww + 8
  }
  return (
    <g>
      {/* тротуар и проезжая часть (видны через стекло дверей) */}
      <rect x="0" y="600" width="1600" height="300" fill="#6d6874" />
      <rect x="0" y="600" width="1600" height="300" fill="url(#pat-paving)" opacity=".9" />
      <rect x="0" y="600" width="1600" height="300" fill="url(#tex-grain)" opacity=".35" />
      {items.map((b, i) => (
        <Building key={i} x={b.x} w={b.w} h={b.h} y={600} color={theme.wall[i % theme.wall.length]} seed={i * 13 + anchor.length} facade={b.facade} roof={b.roof} shopfront lit={0.55} detail={1} snow />
      ))}
      <rect x="0" y="600" width="1600" height="20" fill="url(#ao-down)" opacity=".5" />
      <g className="wet-sheen">
        <rect x="0" y="606" width="1600" height="90" fill="url(#refl-warm)" opacity=".35" />
      </g>
      <g className="snow-cap"><rect x="0" y="598" width="1600" height="30" fill="#eef2fa" /></g>
    </g>
  )
})

/** Ближний план: фонари, деревья, урны — быстро проносятся у самого окна. */
const BusCityNear = memo(function BusCityNear({ season }: { season: Season }) {
  return (
    <g>
      {[260, 1060].map((x, i) => <Tree key={x} x={x} y={660} s={1.25} season={season} seed={i * 7 + 3} still />)}
      {[0, 400, 800, 1200].map((x) => (
        <g key={x}>
          <Lamp x={x + 30} y={660} s={1.5} style="modern" />
          <LampGlow x={x + 30} y={660} s={1.5} style="modern" />
        </g>
      ))}
      <rect x="0" y="652" width="1600" height="10" fill="#8d8a92" />
      <rect x="0" y="652" width="1600" height="2" fill="#c8c4c6" />
    </g>
  )
})

/** Сиденье автобуса (вид спереди): пластиковая оболочка, тканевая вставка, ручка-поручень сверху. */
function BusSeats({ xs }: { xs: number[] }) {
  let shell = ''
  let fabric = ''
  let cushion = ''
  let front = ''
  let seams = ''
  for (const c of xs) {
    shell += rr(c - 46, 538, 92, 130, 18)
    fabric += rr(c - 38, 552, 76, 104, 12)
    cushion += `M${c - 46} 664Q${c} 654 ${c + 46} 664L${c + 47} 676Q${c} 670 ${c - 47} 676Z`
    front += `M${c - 47} 676Q${c} 670 ${c + 47} 676L${c + 45} 690Q${c} 694 ${c - 45} 690Z`
    seams += `M${c - 30} 590Q${c} 584 ${c + 30} 590M${c - 30} 624Q${c} 618 ${c + 30} 624`
  }
  return (
    <g>
      {xs.map((c) => <rect key={c} x={c - 7} y="688" width="14" height={FLOOR_Y - 688} fill="url(#dark-metal-v)" />)}
      <path d={shell} fill="#6f7684" />
      <path d={shell} fill="url(#shade-x)" opacity=".8" />
      <path d={fabric} fill="#33507e" />
      <path d={fabric} fill="url(#pat-moquette)" />
      <path d={fabric} fill="url(#shade-y)" />
      <path d={seams} stroke="#22385e" strokeWidth="1.6" fill="none" opacity=".8" />
      <path d={cushion} fill="#4a6aa0" />
      <path d={cushion} fill="url(#pat-moquette)" />
      <path d={front} fill="#243a62" />
      {/* ручки на спинках */}
      {xs.map((c) => <path key={c} d={`M${c - 22} 540 V528 Q${c - 22} 520 ${c - 14} 520 H${c + 14} Q${c + 22} 520 ${c + 22} 528 V540`} fill="none" stroke="url(#yellow-rail)" strokeWidth="6" strokeLinecap="round" />)}
    </g>
  )
}

/** Створки двери: стекло на всю высоту, резиновые уплотнители, наклейки. Открываются по data-door. */
function BusDoor() {
  const { x, w, top } = BUS_DOOR
  const lw = w / 2
  const leaf = (lx: number, cls: string) => {
    const glass = rr(lx + 12, top + 16, lw - 24, 420, 10)
    return (
      <g className={cls}>
        <path d={`M${lx} ${top}h${lw}v${FLOOR_Y - top}h${-lw}Z${glass}`} fill="#9aa1ad" fillRule="evenodd" />
        <path d={`M${lx} ${top}h${lw}v${FLOOR_Y - top}h${-lw}Z${glass}`} fill="url(#shade-x)" fillRule="evenodd" opacity=".5" />
        <path d={glass} fill="#1e2636" opacity=".18" />
        <path d={glass} fill="none" stroke="#17161c" strokeWidth="5" />
        <path d={`M${lx + 18} ${top + 24} L${lx + 44} ${top + 24} L${lx + 22} ${top + 210} L${lx + 18} ${top + 210} Z`} fill="#fff" opacity=".12" />
        {/* горизонтальный поручень на створке */}
        <rect x={lx + 16} y={top + 300} width={lw - 32} height="7" rx="3.5" fill="url(#yellow-rail)" />
        <rect x={lx + 22} y={top + 446} width={lw - 44} height="18" rx="3" fill="#f2efe8" />
        <text x={lx + lw / 2} y={top + 459} fontSize="9" textAnchor="middle" fill="#c8323a" fontFamily="Manrope, sans-serif" fontWeight="800">НЕ ПРИСЛОНЯТЬСЯ</text>
      </g>
    )
  }
  return (
    <g data-testid="bus-door">
      {/* ступенька и порог (жёлтая кромка) */}
      <rect x={x} y={FLOOR_Y - 10} width={w} height="12" fill="#3a3842" />
      <rect x={x} y={FLOOR_Y - 12} width={w} height="5" fill="#e8b820" />
      {leaf(x, 'bus-door-l')}
      {leaf(x + lw, 'bus-door-r')}
      {/* рамка проёма + индикатор */}
      <path d={`M${x - 8} ${FLOOR_Y} V${top - 8} H${x + w + 8} V${FLOOR_Y}`} fill="none" stroke="#7c828e" strokeWidth="12" />
      <path d={`M${x - 2} ${FLOOR_Y} V${top - 2} H${x + w + 2} V${FLOOR_Y}`} fill="none" stroke="#202028" strokeWidth="3" />
      <circle cx={x + w / 2} cy={top - 20} r="5" fill="#3a3a42" />
      <circle cx={x + w / 2} cy={top - 20} r="5" fill="#3bd16f" className="door-open-o" />
    </g>
  )
}

/** Валидатор на стойке: корпус, экран со статусом, зона касания карты. */
function Validator({ x, y, paid }: { x: number; y: number; paid: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} data-testid="validator">
      <rect x="-30" y="-6" width="24" height="12" rx="3" fill="#2a2a30" />
      <rect x="-74" y="-52" width="50" height="96" rx="9" fill="#2b2f36" />
      <rect x="-74" y="-52" width="50" height="96" rx="9" fill="url(#shade-x)" opacity=".7" />
      <rect x="-68" y="-44" width="38" height="30" rx="3" fill={paid ? '#123a22' : '#0e1622'} />
      {paid ? (
        <g>
          <path d="M-58 -30 l5 5 l10 -10" stroke="#5ff08f" strokeWidth="3" fill="none" strokeLinecap="round" />
          <text x="-49" y="-17" fontSize="5.5" textAnchor="middle" fill="#bfffd2" fontFamily="Manrope, sans-serif" fontWeight="700">ОПЛАЧЕНО</text>
        </g>
      ) : (
        <text x="-49" y="-26" fontSize="5.2" textAnchor="middle" fill="#cfe2ff" fontFamily="Manrope, sans-serif" fontWeight="700">
          <tspan x="-49">ПРИЛОЖИТЕ</tspan>
          <tspan x="-49" dy="7">КАРТУ</tspan>
        </text>
      )}
      <rect x="-68" y="-6" width="38" height="38" rx="6" fill="#e8b820" />
      <circle cx="-49" cy="13" r="10" fill="none" stroke="#2b2f36" strokeWidth="1.6" />
      <path d="M-53 9 q4 4 0 8 M-49 6 q7 7 0 14" stroke="#2b2f36" strokeWidth="1.4" fill="none" />
      <rect x="-68" y="-6" width="38" height="10" rx="5" fill="#fff" opacity=".2" />
    </g>
  )
}

/** Табло маршрута: бегущих букв нет — настоящая типографика с данными события. */
function RouteDisplay({ x, y, w }: { x: number; y: number; w: number }) {
  const event = useEvent()
  const minutes = useWorldStore((s) => Math.floor(s.minutes))
  const route = event?.line?.name ?? 'Б'
  const color = event?.line?.color ?? '#d6452e'
  const station = event?.station ?? LOCATIONS[event?.anchor ?? 'tverskaya'].name
  const next = event?.nextStation ?? station
  const to = event?.trip ? LOCATIONS[event.trip.to].name : LOCATIONS[event?.anchor ?? 'tverskaya'].name
  const short = route.length > 9 ? `${route.slice(0, 9)}…` : route
  return (
    <g transform={`translate(${x} ${y})`} data-testid="bus-display">
      <rect x="-6" y="-6" width={w + 12} height="88" rx="8" fill="#3a3d46" />
      <rect width={w} height="76" rx="5" fill="#0b0c12" />
      <rect x="10" y="10" width={Math.max(56, short.length * 14 + 20)} height="30" rx="4" fill={color} />
      <text x={10 + Math.max(56, short.length * 14 + 20) / 2} y="31" fontSize="17" textAnchor="middle" fill="#fff" fontFamily="Manrope, sans-serif" fontWeight="800">{short}</text>
      <text x={Math.max(56, short.length * 14 + 20) + 24} y="31" fontSize="15" fill="#ffb84a" fontFamily="Manrope, sans-serif" fontWeight="700">→ {to}</text>
      <text x={w - 12} y="31" fontSize="15" textAnchor="end" fill="#ffb84a" fontFamily="Manrope, sans-serif" fontWeight="700" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTime(minutes)}</text>
      <g className="stop-off">
        <text x="12" y="62" fontSize="12" fill="#9fb4d8" fontFamily="Manrope, sans-serif" fontWeight="600">Следующая остановка:</text>
        <text x="152" y="62" fontSize="15" fill="#fff3d6" fontFamily="Manrope, sans-serif" fontWeight="800">{next}</text>
      </g>
      <g className="stop-on">
        <text x="12" y="62" fontSize="12" fill="#ffd27a" fontFamily="Manrope, sans-serif" fontWeight="600">Остановка:</text>
        <text x="92" y="62" fontSize="15" fill="#fff3d6" fontFamily="Manrope, sans-serif" fontWeight="800">{station}</text>
      </g>
      <rect width={w} height="20" rx="5" fill="#fff" opacity=".04" />
    </g>
  )
}

function busRideState(phase: TravelPhase | undefined): RideState {
  if (phase === 'bus-validate' || phase === 'bus-boarding' || phase === 'bus-alighting') return 'board'
  if (phase === 'bus-traffic-light') return 'stop'
  return 'run'
}

export function BusRideScene() {
  const event = useEvent()
  const season = useWorldStore((s) => s.season)
  const anchor: LocationId = event?.anchor ?? 'tverskaya'
  const theme = LOCATIONS[anchor].theme
  const phase = event?.phase
  const state = busRideState(phase)
  const wrap = useRef<HTMLDivElement>(null)
  const cycle = useMemo(() => ({ run: 26, stop: 9, door: true }), [])
  useRideCycle(wrap, state, cycle)

  const validating = phase === 'bus-validate'
  const standing = !validating && (event?.pose === 'stand' || event?.pose === 'walk')
  const heroPlace: HeroPlace = validating
    ? { x: VALIDATOR.x - 70 - 46 * 1.95, y: 792, s: 1.95, pose: 'pole', indoor: true, facing: 1 }
    : standing
      ? { x: POLES[1] - 46 * 1.95, y: 792, s: 1.95, pose: 'pole', indoor: true, facing: 1 }
      : { x: BUS_SEATS[2], y: FEET, s: SEAT_S, pose: event?.pose === 'read' ? 'read' : 'sit', indoor: true, view: 'front' }

  const back = (
    <g>
      <rect x="-60" y="-20" width="1720" height="940" fill="url(#sky)" />
      <Stars count={50} />
      <g transform="translate(0 40)"><Landmark theme={theme} baseY={600} haze={0.55} /></g>
      <rect x="-60" y="420" width="1720" height="200" fill="url(#atmo)" opacity=".5" />
    </g>
  )
  const underlay = (
    <>
      <PanPlane duration={30} testId="bus-city"><BusCityMid anchor={anchor} /></PanPlane>
      <PanPlane duration={9}><BusCityNear season={season} /></PanPlane>
    </>
  )

  const art = (
    <g>
      {/* ── потолок: панели, световые линии, вентиляция, продольный поручень ── */}
      <rect x="-60" y="-20" width="1720" height={CEIL_B + 24} fill="#d9d6d0" />
      <rect x="-60" y="-20" width="1720" height={CEIL_B + 24} fill="url(#shade-y)" opacity=".55" />
      <Texture x={-60} y={-20} w={1720} h={CEIL_B + 24} grain={0.25} blotch={0.2} />
      <rect x="-60" y="22" width="1720" height="26" fill="#fbf8ef" />
      <rect x="-60" y="46" width="1720" height="4" fill="#a8a296" />
      <rect x="-60" y="168" width="1720" height="12" fill="#fbf8ef" />
      <rect x="-60" y="180" width="1720" height="6" fill="#9a9488" opacity=".6" />
      <rect x="-60" y="196" width="1720" height="18" fill="#c4c0b8" />
      <rect x="-60" y="120" width="1720" height="16" fill="url(#pat-grille)" opacity=".35" />
      <rect x="-60" y="92" width="1720" height="10" rx="5" fill="url(#yellow-rail)" />
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i} className="strap" style={{ transformOrigin: `${70 + i * 190}px 100px`, animationDelay: `${-i * 0.41}s` }}>
          <rect x={66 + i * 190} y="100" width="8" height="24" fill="#2a2a32" />
          <path d={`M${58 + i * 190} 124 h24 v6 a12 12 0 0 1 -24 0 z`} fill="#e8b820" />
        </g>
      ))}

      {/* ── борт с вырезами окон и дверного проёма ── */}
      <path d={BUS_WALL_D} fill="#c9c6c0" fillRule="evenodd" />
      <path d={BUS_WALL_D} fill="url(#tex-blotch)" fillRule="evenodd" opacity=".22" />
      <path d={BUS_WALL_D} fill="url(#tex-grain)" fillRule="evenodd" opacity=".3" />
      <rect x="-60" y={CEIL_B} width="1720" height="14" fill="url(#ao-down)" opacity=".55" />
      {BUS_WINDOWS.map(([a, b]) => (
        <g key={a}>
          <path d={rr(a, WIN_T, b - a, WIN_B - WIN_T, 22)} fill="none" stroke="#18171d" strokeWidth="7" />
          <path d={rr(a - 7, WIN_T - 7, b - a + 14, WIN_B - WIN_T + 14, 27)} fill="none" stroke="#e4e1da" strokeWidth="3" />
          {/* форточка */}
          <rect x={a + 8} y={WIN_T + 60} width={Math.min(240, b - a - 16)} height="6" fill="#2b2a32" />
          <rect x={a + 8} y={WIN_T + 4} width={Math.min(240, b - a - 16)} height="56" fill="#1d2230" opacity=".12" />
        </g>
      ))}
      {/* отражения салона в стекле: сильнее ночью */}
      <g style={{ opacity: 'calc(0.35 + var(--night) * 0.65)' }} pointerEvents="none">
        {BUS_WINDOWS.map(([a, b]) => (
          <g key={a}>
            <rect x={a + 10} y={WIN_T + 10} width={b - a - 20} height="6" rx="3" fill="#fff8e8" opacity=".22" />
            <path d={`M${a + 40} ${WIN_T} L${a + 96} ${WIN_T} L${a + 40} ${WIN_B} L${a - 16} ${WIN_B} Z`} fill="#fff" opacity=".06" />
            <rect x={a} y={WIN_T + 132} width={b - a} height="5" fill="#e8b820" opacity=".12" />
          </g>
        ))}
      </g>
      {/* подоконник, панель отопления под окнами */}
      <rect x="-60" y={WIN_B + 8} width="1720" height="10" fill="#e9e6df" />
      <rect x="-60" y={WIN_B + 18} width="1720" height="6" fill="#8a867e" opacity=".55" />
      <rect x="-60" y="640" width="1720" height="30" fill="url(#pat-grille)" opacity=".35" />
      {/* стикеры: схема маршрута рядом с дверью, «место для инвалидов» */}
      <g transform="translate(560 600)">
        <rect width="60" height="60" rx="6" fill="#1f5fbf" />
        <circle cx="30" cy="16" r="5" fill="#fff" />
        <path d="M28 24 v14 h12 l4 10 M22 32 a12 12 0 1 0 18 12" stroke="#fff" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      </g>
      <rect x="520" y="676" width="190" height="10" rx="5" fill="url(#yellow-rail)" />
      <BusDoor />
      <BusSeats xs={BUS_SEATS} />

      {/* ── вертикальные стойки (жёлтые) с кнопками «стоп» ── */}
      {POLES.map((x) => (
        <g key={x}>
          <rect x={x - 6} y="92" width="12" height={FLOOR_Y + 40 - 92} fill="url(#yellow-rail)" />
          <ellipse cx={x} cy={FLOOR_Y + 40} rx="14" ry="4" fill="#4a4650" />
          <g transform={`translate(${x} 470)`}>
            <rect x="-11" y="-16" width="22" height="32" rx="5" fill="#2b2f36" />
            <circle r="7" fill="#d9322a" />
            <text y="2.6" fontSize="5" textAnchor="middle" fill="#fff" fontFamily="Manrope, sans-serif" fontWeight="800">СТОП</text>
          </g>
        </g>
      ))}
      <Validator x={VALIDATOR.x} y={VALIDATOR.y} paid={validating} />
      <RouteDisplay x={840} y={8} w={560} />

      {/* ── пол: резина с крошкой, жёлтые кромки, блики окон ── */}
      <rect x="-60" y={FLOOR_Y} width="1720" height={920 - FLOOR_Y} fill="#55525c" />
      <rect x="-60" y={FLOOR_Y} width="1720" height={920 - FLOOR_Y} fill="url(#pat-rubber)" />
      <rect x="-60" y={FLOOR_Y} width="1720" height={920 - FLOOR_Y} fill="url(#tex-grain)" opacity=".45" />
      <rect x="-60" y={FLOOR_Y} width="1720" height="36" fill="url(#ao-down)" opacity=".7" />
      <g className="day-only">
        <g opacity=".06">{BUS_WINDOWS.map(([a, b]) => <path key={a} d={`M${a + 30} ${FLOOR_Y + 30} L${b - 30} ${FLOOR_Y + 30} L${b + 60} 860 L${a + 120} 860 Z`} fill="#fff4dc" />)}</g>
      </g>
      <rect x="-60" y="840" width="1720" height="80" fill="url(#ao-up)" opacity=".6" />

      {/* ── пассажиры ── */}
      <SeatedFolks
        items={[
          { x: BUS_SEATS[0], y: FEET, s: SEAT_S, seed: 71, pose: 'phone', seated: true, view: 'front' },
          { x: BUS_SEATS[1], y: FEET, s: SEAT_S, seed: 12, pose: 'doze', seated: true, view: 'front' },
          { x: BUS_SEATS[3], y: FEET, s: SEAT_S, seed: 44, pose: 'read', seated: true, view: 'front' },
          { x: BUS_SEATS[4], y: FEET, s: SEAT_S, seed: 93, pose: 'listen', seated: true, view: 'front', headphones: true },
          { x: BUS_SEATS[5], y: FEET, s: SEAT_S, seed: 18, pose: 'sit', seated: true, view: 'front' },
        ]}
      />
      {!standing && !validating && <g transform="translate(1128 800) scale(2)"><Person pose="pole" facing={-1} palette={randomPalette(mulberry32(611))} look={{ coat: 'jacket' }} bag="cross" /></g>}
      {(standing || validating) && <SeatedFolks items={[{ x: BUS_SEATS[2], y: FEET, s: SEAT_S, seed: 205, pose: 'sit', seated: true, view: 'front' }]} />}
      <Hero place={heroPlace} />
      <rect x="-60" y="-20" width="1720" height="90" fill="url(#ao-down)" opacity=".45" />
    </g>
  )

  const lights = (
    <>
      <rect x="-60" y="10" width="1720" height="60" fill="url(#glow-soft)" style={{ mixBlendMode: 'screen' }} />
      {Array.from({ length: 8 }, (_, i) => <ellipse key={i} cx={i * 220 + 40} cy="40" rx="190" ry="70" fill="url(#glow-white)" opacity=".22" style={{ mixBlendMode: 'screen' }} />)}
      {/* дневной свет из окон на сиденьях и полу */}
      <g className="day-only">
        {BUS_WINDOWS.map(([a, b]) => <rect key={a} x={a} y={WIN_B - 30} width={b - a} height="160" fill="url(#glow-soft)" opacity=".35" style={{ mixBlendMode: 'screen' }} />)}
      </g>
      {/* стоп-сигналы машин впереди — красный отсвет на стекле при остановке */}
      <g className="stop-on">
        <rect x="-60" y={WIN_B - 120} width="1720" height="140" fill="url(#glow-red)" opacity=".25" style={{ mixBlendMode: 'screen' }} />
      </g>
    </>
  )
  const bloom = (
    <>
      <rect x="-60" y="24" width="1720" height="22" fill="#fffbe9" />
      <rect x="-60" y="168" width="1720" height="10" fill="#fffbe9" />
    </>
  )
  return (
    <div ref={wrap} className="absolute inset-0" data-testid="bus-scene" data-phase={phase ?? 'bus-ride'}>
      <SceneShell back={back} underlay={underlay} art={art} lights={lights} bloom={bloom} depths={{ back: 0, art: 0 }} artClassName="car-rock" />
    </div>
  )
}

// ═════════════════════ ТАКСИ ═════════════════════
// Вид с заднего сиденья: спинки передних кресел, водитель со спины, приборы, навигатор,
// лобовое стекло с дорогой в перспективе, боковые стёкла — огни города проносятся мимо.
const VP = { x: 800, y: 318 }
const WS = { tl: 250, tr: 1350, top: 96, bl: 150, br: 1450, bot: 470 }
const WS_D = `M${WS.tl} ${WS.top} Q${VP.x} ${WS.top - 26} ${WS.tr} ${WS.top} L${WS.br} ${WS.bot} Q${VP.x} ${WS.bot + 14} ${WS.bl} ${WS.bot} Z`
const SIDE_L = `M-60 120 L120 110 L60 560 L-60 600 Z`
const SIDE_R = `M1660 120 L1480 110 L1540 560 L1660 600 Z`

/** Стёкла такси в координатах сцены (капли дождя). */
export const TAXI_GLASS: Rect[] = [
  { x: WS.tl, y: WS.top, w: WS.tr - WS.tl, h: WS.bot - WS.top },
  { x: 0, y: 120, w: 110, h: 440 },
  { x: 1490, y: 120, w: 110, h: 440 },
]

/** Улица в перспективе за лобовым стеклом (статичная часть). */
const TaxiRoad = memo(function TaxiRoad({ anchor }: { anchor: LocationId }) {
  const theme = LOCATIONS[anchor].theme
  const rng = mulberry32(anchor.length * 53)
  // фасады вдоль улицы: трапеции, сходящиеся к VP, окна — составными path
  const side = (dir: -1 | 1) => {
    const out: { d: string; c: string; win: string; lit: string }[] = []
    let x0 = dir < 0 ? -100 : 1700
    for (let i = 0; i < 6; i++) {
      const dx = (VP.x - x0) * (0.32 + rng() * 0.1)
      const x1 = x0 + dx
      const k0 = (x0 - VP.x) / (dir < 0 ? -900 : 900)
      const k1 = (x1 - VP.x) / (dir < 0 ? -900 : 900)
      const h0 = 520 * Math.abs(k0) + 40
      const h1 = 520 * Math.abs(k1) + 40
      const g0 = VP.y + 300 * Math.abs(k0)
      const g1 = VP.y + 300 * Math.abs(k1)
      const d = `M${x0} ${g0} L${x0} ${g0 - h0} L${x1} ${g1 - h1} L${x1} ${g1} Z`
      let win = ''
      let lit = ''
      const rows = 6
      const cols = 4
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const t0 = (c + 0.25) / cols
          const t1 = (c + 0.75) / cols
          const xa = x0 + (x1 - x0) * t0
          const xb = x0 + (x1 - x0) * t1
          const ga = g0 + (g1 - g0) * t0
          const gb = g0 + (g1 - g0) * t1
          const ha = h0 + (h1 - h0) * t0
          const hb = h0 + (h1 - h0) * t1
          const v0 = 0.12 + r * 0.13
          const v1 = v0 + 0.07
          const p = `M${xa} ${ga - ha * (1 - v0)} L${xb} ${gb - hb * (1 - v0)} L${xb} ${gb - hb * (1 - v1)} L${xa} ${ga - ha * (1 - v1)} Z`
          if (rng() < 0.45) lit += p
          else win += p
        }
      }
      out.push({ d, c: theme.wall[(i + (dir > 0 ? 1 : 0)) % theme.wall.length], win, lit })
      x0 = x1 + (VP.x - x1) * 0.04
    }
    return out
  }
  const left = side(-1)
  const right = side(1)
  return (
    <g>
      <rect x={WS.bl - 20} y={WS.top - 40} width={WS.br - WS.bl + 40} height="460" fill="url(#sky)" />
      <Stars count={30} />
      <g transform={`translate(${VP.x - 800} ${VP.y - 470}) scale(1)`}><Landmark theme={theme} baseY={470} haze={0.6} /></g>
      <rect x="0" y={VP.y - 140} width="1600" height="160" fill="url(#atmo)" opacity=".8" />
      {[...left, ...right].map((b, i) => (
        <g key={i}>
          <path d={b.d} fill={mixHex(b.c, '#2a2440', 0.25)} />
          <path d={b.d} fill="url(#facade-light)" />
          <path d={b.win} fill="#2a3048" opacity=".85" />
          <path d={b.lit} fill="url(#win-warm)" className="win-lit" />
        </g>
      ))}
      {/* асфальт и тротуары в перспективе */}
      <path d={`M${VP.x - 6} ${VP.y} L${VP.x + 6} ${VP.y} L1700 760 L-100 760 Z`} fill="#3d3a46" />
      <path d={`M${VP.x - 6} ${VP.y} L${VP.x + 6} ${VP.y} L1700 760 L-100 760 Z`} fill="url(#tex-asphalt)" opacity=".7" />
      <path d={`M${VP.x - 8} ${VP.y} L-100 640 L-100 760 Z M${VP.x + 8} ${VP.y} L1700 640 L1700 760 Z`} fill="#6e6a76" />
      <path d={`M${VP.x - 3} ${VP.y} L${VP.x - 300} 760 M${VP.x + 3} ${VP.y} L${VP.x + 300} 760`} stroke="#d8d4cc" strokeWidth="3" opacity=".5" />
      <g className="wet-sheen">
        <path d={`M${VP.x - 40} ${VP.y + 10} L${VP.x + 40} ${VP.y + 10} L${VP.x + 300} 760 L${VP.x - 300} 760 Z`} fill="url(#refl-warm)" opacity=".5" />
      </g>
      <g className="snow-cap">
        <path d={`M${VP.x - 8} ${VP.y} L-100 640 L-100 760 Z M${VP.x + 8} ${VP.y} L1700 640 L1700 760 Z`} fill="#eef2fa" />
      </g>
    </g>
  )
})

/** Подвижные элементы дороги: разметка и фонари бегут навстречу (CSS translate+scale от точки схода). */
function RoadMotion() {
  const dashes = Array.from({ length: 6 }, (_, i) => i)
  const posts = Array.from({ length: 4 }, (_, i) => i)
  return (
    <g>
      {dashes.map((i) => (
        <g key={i} className="road-dash run-anim" style={{ ['--dx0' as string]: `${VP.x}px`, ['--dy0' as string]: `${VP.y + 4}px`, ['--dx1' as string]: `${VP.x}px`, ['--dy1' as string]: '600px', animationDelay: `${(-i * 1.1) / 6}s` }}>
          <path d="M-5 -26 L5 -26 L9 26 L-9 26 Z" fill="#f2efe6" opacity=".85" />
        </g>
      ))}
      {posts.map((i) => (
        <g key={`l${i}`}>
          <g className="road-post run-anim" style={{ ['--dx0' as string]: `${VP.x - 30}px`, ['--dy0' as string]: `${VP.y}px`, ['--dx1' as string]: '-200px', ['--dy1' as string]: '640px', animationDelay: `${(-i * 2.6) / 4}s` }}>
            <rect x="-4" y="-300" width="8" height="300" fill="#26262e" />
            <path d="M0 -300 Q0 -320 40 -320" stroke="#26262e" strokeWidth="6" fill="none" />
            <rect x="26" y="-326" width="40" height="10" rx="4" fill="#fff4d0" className="win-lit" />
            <circle cx="46" cy="-316" r="60" fill="url(#glow-warm)" className="lamp-lit" />
          </g>
          <g className="road-post run-anim" style={{ ['--dx0' as string]: `${VP.x + 30}px`, ['--dy0' as string]: `${VP.y}px`, ['--dx1' as string]: '1800px', ['--dy1' as string]: '640px', animationDelay: `${(-i * 2.6) / 4 - 1.3}s` }}>
            <rect x="-4" y="-300" width="8" height="300" fill="#26262e" />
            <path d="M0 -300 Q0 -320 -40 -320" stroke="#26262e" strokeWidth="6" fill="none" />
            <rect x="-66" y="-326" width="40" height="10" rx="4" fill="#fff4d0" className="win-lit" />
            <circle cx="-46" cy="-316" r="60" fill="url(#glow-warm)" className="lamp-lit" />
          </g>
        </g>
      ))}
    </g>
  )
}

/** Машина впереди (вид сзади) + светофор над перекрёстком. */
function CarAhead() {
  return (
    <g>
      <g transform={`translate(${VP.x - 10} ${VP.y + 66})`}>
        <ellipse cx="0" cy="40" rx="92" ry="10" fill="url(#contact)" />
        <path d="M-84 36 L-86 6 Q-84 -8 -70 -12 L-56 -40 Q-50 -48 -36 -48 L36 -48 Q50 -48 56 -40 L70 -12 Q84 -8 86 6 L84 36 Z" fill="#4a5a7a" />
        <path d="M-84 36 L-86 6 Q-84 -8 -70 -12 L-56 -40 Q-50 -48 -36 -48 L36 -48 Q50 -48 56 -40 L70 -12 Q84 -8 86 6 L84 36 Z" fill="url(#shade-y)" />
        <path d="M-50 -14 L-40 -38 L40 -38 L50 -14 Z" fill="#1e2434" />
        <path d="M-40 -36 L-20 -36 L-30 -16 L-46 -16 Z" fill="#cfe0f0" opacity=".15" />
        <rect x="-26" y="4" width="52" height="14" rx="2" fill="#e8e4d8" />
        <text x="0" y="14.5" fontSize="9" textAnchor="middle" fill="#1a1a22" fontFamily="Manrope, sans-serif" fontWeight="800">А 777 МР</text>
        <rect x="-84" y="-6" width="26" height="10" rx="3" fill="#8a1a22" />
        <rect x="58" y="-6" width="26" height="10" rx="3" fill="#8a1a22" />
        <g className="stop-on">
          <rect x="-84" y="-6" width="26" height="10" rx="3" fill="#ff3a3a" />
          <rect x="58" y="-6" width="26" height="10" rx="3" fill="#ff3a3a" />
          <rect x="-12" y="-46" width="24" height="4" rx="2" fill="#ff3a3a" />
        </g>
        <rect x="-80" y="30" width="20" height="14" rx="3" fill="#121216" />
        <rect x="60" y="30" width="20" height="14" rx="3" fill="#121216" />
      </g>
      {/* светофор над дорогой: красный при остановке */}
      <g transform={`translate(${VP.x + 120} ${VP.y - 120})`}>
        <rect x="-60" y="-4" width="120" height="5" fill="#2a2a30" />
        <rect x="-10" y="0" width="20" height="50" rx="4" fill="#202026" />
        <circle cx="0" cy="12" r="5" fill="#3a1414" />
        <circle cx="0" cy="36" r="5" fill="#123a20" />
        <circle cx="0" cy="12" r="5" fill="#ff3b30" className="stop-on" />
        <circle cx="0" cy="36" r="5" fill="#36e07e" className="stop-off" />
      </g>
    </g>
  )
}

function TaxiNavigator({ x, y }: { x: number; y: number }) {
  const event = useEvent()
  const minutes = useWorldStore((s) => Math.floor(s.minutes))
  const to = event?.trip ? LOCATIONS[event.trip.to].name : LOCATIONS[event?.anchor ?? 'arbat'].name
  const eta = Math.max(1, Math.round(event?.duration ?? 12))
  return (
    <g transform={`translate(${x} ${y})`} data-testid="taxi-navigator">
      <rect x="-6" y="-6" width="182" height="112" rx="14" fill="#141418" />
      <rect width="170" height="100" rx="9" fill="#e9ecef" />
      {/* карта: кварталы и маршрут */}
      <g opacity=".9">
        <path d="M0 30 H170 M0 70 H170 M44 0 V100 M120 0 V100" stroke="#fff" strokeWidth="7" />
        <path d="M0 30 H170 M0 70 H170 M44 0 V100 M120 0 V100" stroke="#cfd4da" strokeWidth="1" />
        <path d="M20 96 L44 70 L120 70 L120 30 L156 10" stroke="#f2b51c" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="20" cy="96" r="5" fill="#1a1a22" />
        <circle cx="156" cy="10" r="6" fill="#d9322a" />
      </g>
      <rect y="62" width="170" height="38" rx="0" fill="#1c1d22" opacity=".9" />
      <text x="8" y="76" fontSize="8.5" fill="#f2b51c" fontFamily="Manrope, sans-serif" fontWeight="800">{eta} мин · до места</text>
      <text x="8" y="91" fontSize="9.5" fill="#fff" fontFamily="Manrope, sans-serif" fontWeight="700">{to.length > 24 ? `${to.slice(0, 24)}…` : to}</text>
      <text x="162" y="76" fontSize="8.5" textAnchor="end" fill="#cfd4da" fontFamily="Manrope, sans-serif" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTime(minutes)}</text>
    </g>
  )
}

export function TaxiRideScene() {
  const event = useEvent()
  const anchor: LocationId = event?.anchor ?? 'tverskaya'
  const wrap = useRef<HTMLDivElement>(null)
  const cycle = useMemo(() => ({ run: 22, stop: 7, door: false }), [])
  useRideCycle(wrap, 'run', cycle)
  const driver = useMemo(() => randomPalette(mulberry32(4242)), [])

  // боковые стёкла: огни и фасады проносятся мимо
  const underlay = (
    <PanPlane duration={3.2}>
      <g>
        <rect x="0" y="0" width="1600" height="900" fill="#2b2a3e" />
        <rect x="0" y="0" width="1600" height="900" fill="url(#sky)" opacity=".55" />
        {Array.from({ length: 10 }, (_, i) => (
          <g key={i}>
            <rect x={i * 160} y="120" width="120" height="480" fill={['#5a4a5e', '#4a4660', '#6a5050'][i % 3]} opacity=".9" />
            {Array.from({ length: 6 }, (_, r) => <rect key={r} x={i * 160 + 16 + (r % 2) * 50} y={150 + r * 70} width="34" height="40" fill="url(#win-warm)" className="win-lit" opacity=".8" />)}
            <circle cx={i * 160 + 140} cy="200" r="34" fill="url(#glow-warm)" className="lamp-lit" />
          </g>
        ))}
      </g>
    </PanPlane>
  )
  const mid = (
    <g>
      <defs><clipPath id="taxi-ws"><path d={WS_D} /></clipPath></defs>
      <g clipPath="url(#taxi-ws)">
        <TaxiRoad anchor={anchor} />
        <RoadMotion />
        <CarAhead />
      </g>
    </g>
  )

  const SEAT = '#2c2a32'
  const art = (
    <g>
      {/* ── потолок и стойки кузова (с вырезами стёкол) ── */}
      <path d={`M-60 -20 H1660 V920 H-60 Z ${WS_D} ${SIDE_L} ${SIDE_R}`} fill="#3a3740" fillRule="evenodd" />
      <path d={`M-60 -20 H1660 V920 H-60 Z ${WS_D} ${SIDE_L} ${SIDE_R}`} fill="url(#tex-grain)" fillRule="evenodd" opacity=".35" />
      <rect x="-60" y="-20" width="1720" height="110" fill="#4a4652" />
      <rect x="-60" y="-20" width="1720" height="110" fill="url(#tex-grain-light)" opacity=".15" />
      <rect x="-60" y="70" width="1720" height="30" fill="url(#ao-up)" opacity=".7" />
      {/* А-стойки */}
      <path d={`M${WS.tl - 14} ${WS.top} L${WS.tl + 6} ${WS.top} L${WS.bl + 6} ${WS.bot} L${WS.bl - 40} ${WS.bot + 20} Z`} fill="#2a2830" />
      <path d={`M${WS.tr - 6} ${WS.top} L${WS.tr + 14} ${WS.top} L${WS.br + 40} ${WS.bot + 20} L${WS.br - 6} ${WS.bot} Z`} fill="#2a2830" />
      {/* блик на стекле */}
      <path d={`M${WS.tl + 80} ${WS.top + 6} L${WS.tl + 180} ${WS.top + 4} L${WS.bl + 260} ${WS.bot - 4} L${WS.bl + 170} ${WS.bot - 4} Z`} fill="#fff" opacity=".05" />
      {/* дворники — работают в дождь */}
      <g className="rain-o">
        <g className="wiper" style={{ transformOrigin: `${VP.x - 260}px ${WS.bot + 4}px` }}><path d={`M${VP.x - 260} ${WS.bot + 4} L${VP.x + 120} ${WS.bot - 6}`} stroke="#141418" strokeWidth="5" strokeLinecap="round" /></g>
        <g className="wiper" style={{ transformOrigin: `${VP.x + 200}px ${WS.bot + 4}px`, animationDelay: '-0.1s' }}><path d={`M${VP.x + 200} ${WS.bot + 4} L${VP.x + 560} ${WS.bot - 8}`} stroke="#141418" strokeWidth="5" strokeLinecap="round" /></g>
      </g>
      {/* зеркало заднего вида: в нём — глаза героини */}
      <g transform={`translate(${VP.x} 120)`}>
        <rect x="-6" y="-26" width="12" height="20" fill="#1c1b20" />
        <rect x="-96" y="-8" width="192" height="44" rx="12" fill="#1c1b20" />
        <rect x="-90" y="-3" width="180" height="34" rx="9" fill="#3a3e52" />
        <g opacity=".5">
          <rect x="-90" y="-3" width="180" height="34" rx="9" fill={HERO.skin} opacity=".6" />
          <path d="M-90 -3 H90 V8 Q40 2 0 10 Q-40 2 -90 8 Z" fill={HERO.hair} />
          <ellipse cx="-24" cy="16" rx="5" ry="3.4" fill="#231a2b" />
          <ellipse cx="24" cy="16" rx="5" ry="3.4" fill="#231a2b" />
          <path d="M-34 8 q10 -4 18 0 M16 8 q10 -4 18 0" stroke={HERO.hair} strokeWidth="2" fill="none" />
          <ellipse cx="-80" cy="20" rx="10" ry="14" fill="#f08aa2" />
          <ellipse cx="80" cy="20" rx="10" ry="14" fill="#f08aa2" />
        </g>
        <rect x="-90" y="-3" width="180" height="12" rx="6" fill="#fff" opacity=".12" />
      </g>
      {/* ── торпедо ── */}
      <path d={`M-60 ${WS.bot + 10} Q${VP.x} ${WS.bot - 10} 1660 ${WS.bot + 10} L1660 640 L-60 640 Z`} fill="#25232a" />
      <path d={`M-60 ${WS.bot + 10} Q${VP.x} ${WS.bot - 10} 1660 ${WS.bot + 10} L1660 ${WS.bot + 30} L-60 ${WS.bot + 30} Z`} fill="#3c3944" />
      <path d={`M-60 ${WS.bot + 10} Q${VP.x} ${WS.bot - 10} 1660 ${WS.bot + 10} L1660 640 L-60 640 Z`} fill="url(#tex-grain)" opacity=".4" />
      {/* дефлекторы */}
      {[700, 860].map((x) => <rect key={x} x={x} y={WS.bot + 52} width="70" height="26" rx="6" fill="url(#pat-grille)" stroke="#1a191e" strokeWidth="3" />)}
      {/* приборная панель водителя (светится) */}
      <g transform="translate(330 540)">
        <path d="M-120 -40 Q0 -70 120 -40 L110 20 L-110 20 Z" fill="#16151a" />
        <circle cx="-50" cy="-12" r="26" fill="#0c1220" stroke="#5ac8ff" strokeWidth="2" opacity=".9" />
        <circle cx="50" cy="-12" r="26" fill="#0c1220" stroke="#5ac8ff" strokeWidth="2" opacity=".9" />
        <path d="M-50 -12 L-34 -26 M50 -12 L60 -32" stroke="#ff8a3a" strokeWidth="2.4" strokeLinecap="round" />
        <text x="0" y="-4" fontSize="12" textAnchor="middle" fill="#bfe8ff" fontFamily="Manrope, sans-serif" fontWeight="700">48</text>
      </g>
      {/* руль */}
      <g transform="translate(330 640)">
        <ellipse cx="0" cy="0" rx="150" ry="120" fill="none" stroke="#141317" strokeWidth="26" />
        <ellipse cx="0" cy="0" rx="150" ry="120" fill="none" stroke="#3a3842" strokeWidth="4" strokeDasharray="60 400" />
        <path d="M-60 40 Q0 10 60 40 L40 120 L-40 120 Z" fill="#1a191e" />
      </g>
      <TaxiNavigator x={WS.br - 470} y={WS.bot - 80} />
      {/* центральная консоль: климат и магнитола с подсветкой */}
      <g transform={`translate(${VP.x} 600)`}>
        <path d="M-120 -10 L120 -10 L150 320 L-150 320 Z" fill="#1d1c22" />
        <rect x="-90" y="10" width="180" height="56" rx="8" fill="#0d1018" />
        <text x="-70" y="44" fontSize="18" fill="#7fd0ff" fontFamily="Manrope, sans-serif" fontWeight="700">21.5°</text>
        <text x="70" y="44" fontSize="12" textAnchor="end" fill="#7fd0ff" opacity=".8" fontFamily="Manrope, sans-serif" fontWeight="700">FM 101.2</text>
        {[-60, -20, 20, 60].map((x) => <circle key={x} cx={x} cy="96" r="11" fill="#2a2930" stroke="#45434c" strokeWidth="2" />)}
      </g>
      {/* ароматизатор-«ёлочка» на зеркале */}
      <g transform={`translate(${VP.x - 60} 156)`}>
        <path d="M0 0 V30" stroke="#d9d4c8" strokeWidth="1" />
        <g className="strap" style={{ transformOrigin: '0px 0px' }}><path d="M0 30 L-12 52 H-5 L-14 70 H-4 L-10 84 H10 L4 70 H14 L5 52 H12 Z" fill="#3e8a4c" /></g>
      </g>
      {/* шашечки «ТАКСИ» — наклейка на торпедо */}
      <g transform={`translate(${VP.x - 70} ${WS.bot + 96})`}>
        <rect width="140" height="26" rx="4" fill="#f2c230" />
        <path d="M6 4 h8 v8 h-8z M22 4 h8 v8 h-8z M14 12 h8 v8 h-8z" fill="#1a1a22" />
        <text x="84" y="18" fontSize="13" textAnchor="middle" fill="#1a1a22" fontFamily="Manrope, sans-serif" fontWeight="800">ТАКСИ</text>
      </g>

      {/* ── водитель со спины (слева): плечи, воротник, шея, затылок со стрижкой ── */}
      <g transform="translate(350 900)">
        <path d="M-160 0 Q-158 -150 -116 -196 Q-70 -228 0 -230 Q70 -228 116 -196 Q158 -150 160 0 Z" fill={mixHex(driver.coat, '#1a1428', 0.35)} />
        <path d="M-160 0 Q-158 -150 -116 -196 Q-70 -228 0 -230 Q70 -228 116 -196 Q158 -150 160 0 Z" fill="url(#shade-x)" opacity=".7" />
        <path d="M-120 -150 Q-60 -120 -20 -40 M120 -150 Q60 -120 20 -40" stroke="#000" strokeOpacity=".18" strokeWidth="5" fill="none" />
        {/* воротник */}
        <path d="M-58 -222 Q0 -250 58 -222 L48 -196 Q0 -214 -48 -196 Z" fill={mixHex(driver.coat, '#1a1428', 0.55)} />
        <path d="M-24 -280 L24 -280 L28 -222 Q0 -214 -28 -222 Z" fill={mixHex(driver.skin, '#3a2030', 0.3)} />
        <ellipse cx="-50" cy="-312" rx="8" ry="15" fill={mixHex(driver.skin, '#3a2030', 0.2)} />
        <ellipse cx="50" cy="-312" rx="8" ry="15" fill={mixHex(driver.skin, '#3a2030', 0.2)} />
        <path d="M-50 -300 Q-56 -360 0 -372 Q56 -360 50 -300 Q46 -270 24 -262 Q0 -258 -24 -262 Q-46 -270 -50 -300 Z" fill={driver.hair} />
        <path d="M-42 -300 Q-44 -350 0 -360 Q-30 -340 -34 -296 Z" fill="#fff" opacity=".08" />
        <path d="M-30 -268 Q0 -262 30 -268" stroke="#000" strokeOpacity=".25" strokeWidth="3" fill="none" />
      </g>
      {/* ── спинка переднего пассажирского кресла (ближе всего к камере) ── */}
      <g transform="translate(1180 900)">
        <path d="M-230 20 L-214 -250 Q-206 -290 -160 -296 L160 -296 Q206 -290 214 -250 L230 20 Z" fill={SEAT} />
        <path d="M-230 20 L-214 -250 Q-206 -290 -160 -296 L160 -296 Q206 -290 214 -250 L230 20 Z" fill="url(#pat-moquette)" />
        <path d="M-230 20 L-214 -250 Q-206 -290 -160 -296 L160 -296 Q206 -290 214 -250 L230 20 Z" fill="url(#shade-x)" />
        <path d="M-150 -220 Q0 -236 150 -220 M-170 -120 Q0 -134 170 -120" stroke="#1a191e" strokeWidth="3" fill="none" opacity=".6" />
        {/* подголовник на штангах */}
        <rect x="-40" y="-340" width="8" height="50" fill="url(#metal-v)" />
        <rect x="32" y="-340" width="8" height="50" fill="url(#metal-v)" />
        <rect x="-96" y="-420" width="192" height="92" rx="34" fill={SEAT} />
        <rect x="-96" y="-420" width="192" height="92" rx="34" fill="url(#shade-y)" />
        <rect x="-96" y="-420" width="192" height="92" rx="34" fill="url(#pat-moquette)" />
        {/* карман на спинке */}
        <path d="M-150 -60 L150 -60 L156 10 L-156 10 Z" fill="#232128" />
        <path d="M-150 -60 L150 -60" stroke="#4a4652" strokeWidth="4" />
      </g>
      <rect x="-60" y="760" width="1720" height="160" fill="url(#ao-up)" opacity=".7" />
    </g>
  )
  const lights = (
    <>
      {/* свет фонарей скользит по салону */}
      <g className="lamp-lit">
        <g className="light-sweep run-anim"><rect x="300" y="-20" width="380" height="940" fill="url(#glow-warm)" opacity=".18" style={{ mixBlendMode: 'screen' }} /></g>
      </g>
      <circle cx="330" cy="528" r="120" fill="url(#glow-cool)" opacity=".25" style={{ mixBlendMode: 'screen' }} />
      <rect x={WS.br - 476} y={WS.bot - 86} width="182" height="112" fill="url(#glow-white)" opacity=".2" style={{ mixBlendMode: 'screen' }} />
      <g className="stop-on"><ellipse cx={VP.x - 10} cy={VP.y + 66} rx="200" ry="60" fill="url(#glow-red)" opacity=".7" style={{ mixBlendMode: 'screen' }} /></g>
    </>
  )
  const bloom = (
    <>
      <g className="stop-on"><rect x={VP.x - 94} y={VP.y + 60} width="168" height="10" fill="#ff4040" /></g>
      <circle cx="280" cy="528" r="20" fill="#5ac8ff" opacity=".6" />
      <circle cx="380" cy="528" r="20" fill="#5ac8ff" opacity=".6" />
    </>
  )
  return (
    <div ref={wrap} className="absolute inset-0" data-testid="taxi-scene">
      <SceneShell underlay={underlay} mid={mid} art={art} lights={lights} bloom={bloom} depths={{ mid: 0, art: 0 }} artClassName="car-rock" />
    </div>
  )
}

