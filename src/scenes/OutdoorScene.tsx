import { Fragment, useMemo, type ReactNode } from 'react'
import { LOCATIONS } from '../data/locations'
import { Hero, type HeroPlace } from '../features/characters/Hero'
import { EntityBand, SeatedFolks, useCrowd, type Crowd, type EntityConfig, type HeroLane } from '../features/city/EntityLayer'
import { useWorldStore } from '../stores/worldStore'
import type { LocationId, Season, SceneTheme } from '../types'
import { mixHex, mulberry32 } from '../utils/math'
import { Landmark } from './art/Landmarks'
import { Texture } from './art/materials'
import { Bench, Building, Bush, FallenLeaves, Footprints, Lamp, LampGlow, Lawn, Puddles, SnowDrift, Tree, type FacadeStyle } from './art/primitives'
import { Bin, Birds, Curb, Kiosk, Pigeons, RoadSign, TrafficGlow, TrafficLight, Wires, Zebra } from './art/StreetKit'
import { SceneShell, SkyLayer, SunBloom } from './SceneShell'
import Vehicle from './art/Vehicles'

/** Скамьи стоят у переднего края дорожки, перед всеми полосами прохожих. */
const BENCH_Y = 788
const SNOW = '#f2f5fc'

const hashStr = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

interface Props {
  locId: LocationId
}

type Kind = 'street' | 'park' | 'courtyard'

/** Объект сцены с глубиной (y основания): по ней он встраивается между полосами прохожих. */
interface DepthItem { y: number; node: ReactNode; key: string }

// ───────── вспомогательные элементы ─────────
function Ducks() {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <g key={i} style={{ animation: `duck-swim ${38 + i * 9}s ease-in-out ${-i * 12}s infinite alternate` }} className="ambient-anim">
          <g transform={`translate(${260 + i * 150} ${652 + i * 10}) scale(.85)`}>
            <ellipse cx="0" cy="0" rx="14" ry="7" fill="#efe8dc" />
            <ellipse cx="0" cy="0" rx="14" ry="7" fill="url(#shade-y)" />
            <circle cx="12" cy="-7" r="6" fill="#2f6a4a" />
            <path d="M17 -7 l8 2 l-8 2 Z" fill="#f2a83a" />
            <ellipse cx="-4" cy="-2" rx="7" ry="4" fill="#cfc4b0" />
            <ellipse cx="0" cy="7" rx="22" ry="2.5" fill="#fff" opacity=".2" />
          </g>
        </g>
      ))}
    </g>
  )
}

function Fountain({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="10" rx="256" ry="44" fill="url(#contact)" />
      <ellipse cx="0" cy="8" rx="250" ry="42" fill="#c9b27a" />
      <ellipse cx="0" cy="8" rx="250" ry="42" fill="url(#shade-y)" />
      <ellipse cx="0" cy="0" rx="236" ry="36" fill="#5e9ab8" />
      <ellipse cx="0" cy="-2" rx="200" ry="28" fill="url(#sky-refl)" opacity=".6" />
      <rect x="-16" y="-120" width="32" height="120" fill="url(#brass-v)" />
      <ellipse cx="0" cy="-120" rx="70" ry="12" fill="#e0b84e" />
      <ellipse cx="0" cy="-60" rx="110" ry="16" fill="#e0b84e" />
      <ellipse cx="0" cy="-60" rx="110" ry="16" fill="url(#shade-y)" />
      {[-90, -45, 0, 45, 90].map((dx, i) => (
        <path key={i} d={`M${dx * 0.3} -120 Q${dx} -190 ${dx * 1.4} -50`} stroke="#f4faff" strokeWidth="4" fill="none" opacity=".7" strokeLinecap="round" className="ambient-anim" style={{ animation: `fountain ${1.4 + i * 0.2}s ease-in-out infinite`, transformBox: 'fill-box', transformOrigin: 'bottom' }} />
      ))}
      <g fill="#e0b84e">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2
          return <rect key={i} x={Math.cos(a) * 190 - 6} y={Math.sin(a) * 28 - 26} width="12" height="26" rx="5" />
        })}
      </g>
    </g>
  )
}

function Door({ kind, x, y }: { kind: 'metro' | 'door'; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="2" rx="90" ry="8" fill="url(#contact)" />
      {kind === 'metro' ? (
        <g>
          <rect x="-70" y="-190" width="140" height="190" fill="#e8dcc4" />
          <rect x="-70" y="-190" width="140" height="190" fill="url(#shade-x)" />
          <Texture x={-70} y={-190} w={140} h={190} grain={0.3} blotch={0.3} />
          <path d="M-74 -190 L0 -232 L74 -190Z" fill="#b89e76" />
          <path d="M-36 0 V-96 A36 36 0 0 1 36 -96 V0Z" fill="#3a2f45" />
          <path d="M-30 0 V-92 A30 30 0 0 1 30 -92 V0Z" fill="url(#shop-warm)" className="shop-lit" />
          <circle cx="0" cy="-160" r="26" fill="#d9322a" />
          <path d="M-16 -148 V-174 L0 -156 L16 -174 V-148" stroke="#fff" strokeWidth="6" fill="none" strokeLinejoin="round" />
        </g>
      ) : (
        <g>
          <rect x="-50" y="-130" width="100" height="130" fill="#5a3e32" />
          <rect x="-40" y="-120" width="80" height="120" rx="3" fill="url(#shop-warm)" className="shop-lit" />
          <path d="M-60 -130 H60 L48 -158 H-48Z" fill="#a8343e" />
          <path d="M-60 -130 H60 L48 -158 H-48Z" fill="url(#pat-stripes)" opacity=".3" />
          <rect x="-4" y="-120" width="8" height="120" fill="#5a3e32" />
        </g>
      )}
    </g>
  )
}

function Shelter({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="2" rx="150" ry="8" fill="url(#contact)" />
      <rect x="-130" y="-196" width="260" height="12" rx="3" fill="#30333e" />
      <rect x="-124" y="-184" width="248" height="5" fill="#a8d8ec" opacity=".5" />
      <rect x="-124" y="-184" width="6" height="184" fill="url(#brushed-v)" />
      <rect x="118" y="-184" width="6" height="184" fill="url(#brushed-v)" />
      <rect x="-118" y="-176" width="236" height="120" fill="#a8d8ec" opacity=".16" />
      <path d="M-110 -176 L-60 -176 L-100 -60 L-110 -60 Z" fill="#fff" opacity=".12" />
      {/* карта маршрутов внутри павильона */}
      <rect x="-104" y="-166" width="60" height="80" rx="2" fill="#f2efe6" opacity=".9" />
      <path d="M-96 -150 h44 M-96 -138 h36 M-96 -126 h40 M-96 -114 h30" stroke="#5a6a8a" strokeWidth="2" />
      <rect x="-90" y="-62" width="180" height="8" fill="#5a5466" />
      <g className="snow-cap"><rect x="-134" y="-203" width="268" height="8" rx="4" fill={SNOW} /></g>
      <rect x="132" y="-196" width="14" height="196" fill="url(#dark-metal-v)" />
      <rect x="118" y="-256" width="42" height="58" rx="4" fill="#1f5fbf" />
      <text x="139" y="-226" fontSize="26" fill="#fff" textAnchor="middle" fontWeight="800" fontFamily="Manrope, sans-serif">А</text>
      <text x="139" y="-206" fontSize="8.5" fill="#d8e6ff" textAnchor="middle" fontFamily="Manrope, sans-serif">автобус</text>
    </g>
  )
}

function Swing({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="2" rx="80" ry="7" fill="url(#contact)" />
      <path d="M-70 0 L-20 -120 M70 0 L20 -120 M-20 -120 H20" stroke="#a83a34" strokeWidth="7" fill="none" strokeLinecap="round" />
      <g className="ambient-anim" style={{ transformOrigin: '0px -120px', transformBox: 'view-box', animation: 'swing 3.2s ease-in-out infinite' }}>
        <path d="M-8 -120 V-24 M8 -120 V-24" stroke="#3a3550" strokeWidth="2" />
        <rect x="-14" y="-26" width="28" height="6" rx="3" fill="#e0a83a" />
      </g>
    </g>
  )
}

function Laundry({ x, y, w, seed }: { x: number; y: number; w: number; seed: number }) {
  const rng = mulberry32(seed)
  return (
    <g>
      <path d={`M${x} ${y} Q${x + w / 2} ${y + 10} ${x + w} ${y}`} stroke="#3a3550" strokeWidth="1.5" fill="none" />
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} x={x + 10 + i * (w / 5.4)} y={y + 4} width="14" height={16 + rng() * 10} fill={['#c84a5a', '#efe8dc', '#3e8a88', '#e0b84a', '#7a5390'][i % 5]} className="sway" style={{ ['--sway' as string]: '4deg', ['--sway-dur' as string]: `${2.5 + rng() * 2}s`, transformOrigin: 'top' }} />
      ))}
    </g>
  )
}

function FallingLeaves({ seed }: { seed: number }) {
  const rng = mulberry32(seed + 5)
  const cols = ['#d07a32', '#b8522a', '#e2a842', '#a03e2a']
  return (
    <g className="hi-detail">
      {Array.from({ length: 12 }, (_, i) => (
        <g key={i} transform={`translate(${rng() * 1600} 0)`}>
          <path d="M-6 0 Q0 -4 6 0 Q0 4 -6 0 Z" className="leaf" fill={cols[i % 4]} style={{ ['--drift' as string]: `${(rng() - 0.3) * 260}px`, animation: `leaf-fall ${9 + rng() * 8}s linear ${-rng() * 14}s infinite` }} />
        </g>
      ))}
    </g>
  )
}

// ───────── характер улиц ─────────
interface StreetStyle { facade: FacadeStyle; h: [number, number]; floors?: number; roofs: ('flat' | 'pitched' | 'mansard')[]; ped: boolean; wires: boolean; lamp: 'classic' | 'modern' | 'double' }
const STREET_STYLE: Partial<Record<LocationId, StreetStyle>> = {
  tverskaya: { facade: 'stalin', h: [330, 420], roofs: ['flat', 'flat', 'mansard'], ped: false, wires: true, lamp: 'double' },
  arbat: { facade: 'classic', h: [220, 300], roofs: ['pitched', 'mansard', 'flat'], ped: true, wires: false, lamp: 'classic' },
  'kitay-gorod': { facade: 'brick', h: [250, 330], roofs: ['pitched', 'flat'], ped: false, wires: true, lamp: 'classic' },
  zamoskvorechye: { facade: 'classic', h: [180, 250], roofs: ['pitched', 'pitched', 'mansard'], ped: false, wires: false, lamp: 'classic' },
  khamovniki: { facade: 'brick', h: [240, 320], roofs: ['flat', 'pitched'], ped: false, wires: true, lamp: 'classic' },
  'moscow-city': { facade: 'modern', h: [360, 470], roofs: ['flat'], ped: false, wires: false, lamp: 'modern' },
}
const DEFAULT_STREET: StreetStyle = { facade: 'classic', h: [240, 360], roofs: ['flat', 'pitched', 'mansard', 'flat'], ped: false, wires: true, lamp: 'classic' }

// ───────── сцена ─────────
export default function OutdoorScene({ locId }: Props) {
  const season = useWorldStore((s) => s.season)
  const event = useWorldStore((s) => s.event)
  const eventKey = useWorldStore((s) => s.eventKey)

  const isBusStop = locId === 'bus-stop'
  // у остановки вид и палитра берутся с «якоря» (откуда едет персонаж)
  const themeLoc = isBusStop && event ? LOCATIONS[event.anchor] : LOCATIONS[locId]
  const def = LOCATIONS[locId]
  const theme = themeLoc.theme
  const kind: Kind = isBusStop ? 'street' : def.kind === 'courtyard' ? 'courtyard' : def.kind === 'park' ? 'park' : 'street'
  const seed = hashStr(themeLoc.id + kind)
  const style = STREET_STYLE[themeLoc.id] ?? DEFAULT_STREET
  const pedStreet = kind === 'street' && style.ped && !isBusStop

  const art = useMemo(() => buildArt(kind, theme, themeLoc.id, season, seed, isBusStop, pedStreet, style), [kind, theme, themeLoc.id, season, seed, isBusStop, pedStreet, style])

  // ─ конфиг ambient-слоя
  const cfg: EntityConfig = useMemo(() => {
    if (kind === 'street') {
      return {
        id: locId, pedestrians: def.pedestrians, traffic: pedStreet ? 0.1 : def.traffic,
        pedLanes: [{ y: 664, s: 0.8 }, { y: 783, s: 1.06 }],
        vehLanes: pedStreet ? [{ y: 738, s: 0.86, dir: 1 }] : [{ y: 714, s: 0.72, dir: -1 }, { y: 750, s: 0.88, dir: 1 }],
        vehicles: pedStreet ? ['bike', 'scooter'] : themeLoc.id === 'tverskaya' ? ['car', 'car', 'taxi', 'bus', 'taxi'] : ['car', 'car', 'taxi', 'bus', 'tram', 'bike'],
      }
    }
    if (kind === 'courtyard') {
      return { id: locId, pedestrians: def.pedestrians, traffic: 0.05, pedLanes: [{ y: 742, s: 0.95 }, { y: 763, s: 1.02 }], vehLanes: [{ y: 722, s: 0.78, dir: 1 }], vehicles: ['car', 'bike'] }
    }
    return {
      id: locId, pedestrians: def.pedestrians, traffic: def.traffic * 0.5, park: true,
      pedLanes: [{ y: 736, s: 0.92 }, { y: 760, s: 1 }],
      vehLanes: [{ y: 748, s: 0.96 }], vehicles: ['bike', 'scooter', 'bike'],
    }
  }, [kind, locId, def, pedStreet, themeLoc.id])

  // ─ фазы поездки на остановке/у такси: подъезжающий транспорт, посадка, выход (без телепортов)
  const ph = event?.phase
  const stopVeh: 'bus' | 'taxi' | null =
    ph === 'bus-arrival' || ph === 'bus-boarding' || ph === 'bus-alighting' ? 'bus'
      : ph === 'taxi-arrival' || ph === 'taxi-boarding' || ph === 'taxi-alighting' ? 'taxi' : null
  // транспорт у тротуара — в масштабе людей (автобус выше человека), а не мелкий фоновый поток
  const vehK = stopVeh === 'bus' ? 1.35 : 1.5
  const vehLane = kind === 'street' ? { y: 756, s: vehK } : kind === 'courtyard' ? { y: 726, s: vehK * 0.9 } : { y: 752, s: vehK }
  const vehX = stopVeh === 'bus' ? 880 : 700
  const vehDoor = stopVeh === 'bus' ? vehX + 97 * vehLane.s : vehX - 10 * vehLane.s
  const heroY = kind === 'street' ? 783 : 776

  // ─ положение героя
  const place: HeroPlace = useMemo(() => {
    if (stopVeh) {
      const dur = Math.max(3, event?.duration ?? 4)
      if (ph === 'bus-boarding' || ph === 'taxi-boarding') return { x0: vehDoor + 80, x1: vehDoor, y: heroY, s: 1.08 }
      if (ph === 'bus-alighting' || ph === 'taxi-alighting') return { x0: vehDoor, x1: vehDoor + Math.min(420, 70 * dur), y: heroY, s: 1.08 }
      return { x: vehDoor + 80, y: heroY, s: 1.08, pose: 'stand', facing: -1 }
    }
    if (ph === 'taxi-order' || ph === 'taxi-wait' || ph === 'bus-stop-wait') {
      return { x: isBusStop ? 980 : 820, y: heroY, s: 1.08, pose: event?.pose === 'phone' || ph === 'taxi-order' ? 'phone' : 'wait', facing: -1 }
    }
    const toDoor = !!event?.destination && (event.destination === 'metro-station' || !LOCATIONS[event.destination].outdoor)
    const dur = Math.max(4, event?.duration ?? 20)
    const dir: 1 | -1 = toDoor ? 1 : eventKey % 2 ? 1 : -1
    const len = Math.min(1300, 75 * dur)
    // стопы всех фигур ≤ ~790: ниже — нижняя панель
    const laneY = kind === 'street' ? (toDoor ? 670 : 783) : 776
    const s = kind === 'street' && toDoor ? 0.86 : 1.08
    if (event?.pose === 'walk') {
      const x1 = toDoor ? 1330 : dir > 0 ? 100 + len : 1500 - len
      const x0 = toDoor ? Math.max(60, 1330 - len) : dir > 0 ? 100 : 1500
      return { x0, x1, y: laneY, s }
    }
    if (isBusStop) return { x: 980, y: 784, s: 1.08, pose: 'wait', facing: 1 }
    if (event?.pose === 'sit') {
      const bx = kind === 'courtyard' ? 700 : themeLoc.id === 'patriarshy' ? 1060 : 520
      return { x: bx + (themeLoc.id === 'patriarshy' ? 10 : -10), y: BENCH_Y, s: 1.08, pose: 'sit', facing: themeLoc.id === 'patriarshy' ? -1 : 1 }
    }
    return { x: 820, y: laneY, s: 1.08, pose: event?.pose === 'phone' ? 'phone' : event?.pose === 'drink' ? 'drink' : 'stand' }
  }, [event, eventKey, kind, themeLoc.id, isBusStop, stopVeh, ph, vehDoor, heroY])

  const lampXs = kind === 'street' ? [180, 620, 1060, 1500] : kind === 'park' ? [240, 760, 1300] : [430, 1420]
  const lampY = kind === 'street' ? 684 : kind === 'park' ? 718 : 730
  const lampStyle = kind === 'street' ? style.lamp : 'classic'

  const toDoor = !!event?.destination && (event.destination === 'metro-station' || !LOCATIONS[event.destination].outdoor)
  const doorMark = toDoor ? (
    <Door kind={event!.destination === 'metro-station' ? 'metro' : 'door'} x={1380} y={kind === 'street' ? 640 : 700} />
  ) : null

  const seated =
    kind === 'park'
      ? [{ x: 1322, y: BENCH_Y, s: 1.06, seed: seed + 1 }, { x: 1418, y: BENCH_Y, s: 1.06, seed: seed + 2, flip: true, pose: 'read' as const }]
      : kind === 'courtyard'
        ? [{ x: 1262, y: BENCH_Y, s: 1.06, seed: seed + 3 }]
        : []

  // идущий герой — для толпы, чтобы прохожие в его полосе не налезали на него
  const heroLane: HeroLane | null = useMemo(
    () => (place.x0 !== undefined && place.x1 !== undefined ? { x0: place.x0, x1: place.x1, y: place.y, dur: Math.max(4, event?.duration ?? 8), key: eventKey } : null),
    [place, event, eventKey],
  )
  const crowd = useCrowd(cfg, heroLane)

  const benches = (
    <g>
      {kind === 'park' && (
        <g>
          <Bench x={themeLoc.id === 'patriarshy' ? 1060 : 520} y={BENCH_Y} s={1.08} flip={themeLoc.id === 'patriarshy'} />
          <Bench x={1370} y={BENCH_Y} s={1.06} />
        </g>
      )}
      {kind === 'courtyard' && (
        <g>
          <Bench x={700} y={BENCH_Y} s={1.08} />
          <Bench x={1280} y={BENCH_Y} s={1.06} />
        </g>
      )}
      <SeatedFolks items={seated} outdoor />
    </g>
  )

  // ─ z-порядок: все объекты с глубиной сортируются по y основания; прохожие — полосами между ними
  const items: DepthItem[] = [
    ...art.props,
    {
      y: place.y,
      key: 'hero',
      node: (
        <g key={`${eventKey}`} className={ph === 'bus-boarding' || ph === 'taxi-boarding' ? 'board-in' : ph === 'bus-alighting' || ph === 'taxi-alighting' ? 'board-out' : ''} style={{ ['--dur' as string]: `${Math.max(3, event?.duration ?? 4)}s` }}>
          <Hero place={place} />
        </g>
      ),
    },
    { y: BENCH_Y - 0.1, key: 'benches', node: benches },
  ]
  if (doorMark) items.push({ y: kind === 'street' ? 641 : 701, key: 'door', node: doorMark })
  if (isBusStop) items.push({ y: 792, key: 'shelter', node: <Shelter x={980} y={792} /> })
  if (stopVeh) {
    const route = event?.line?.name
    items.push({
      y: vehLane.y,
      key: 'stop-vehicle',
      node: (
        <g transform={`translate(${vehX} ${vehLane.y}) scale(${vehLane.s})`} data-testid="stop-vehicle">
          {/* подъезжает и тормозит; на посадке/выходе стоит с открытыми дверями */}
          <g className={ph === 'bus-arrival' || ph === 'taxi-arrival' ? 'veh-pull-in' : ''}>
            <Vehicle kind={stopVeh} still={ph !== 'bus-arrival' && ph !== 'taxi-arrival'} route={route} doorsOpen={ph !== 'bus-arrival' && ph !== 'taxi-arrival'} />
          </g>
        </g>
      ),
    })
  }

  const artNode = (
    <>
      {art.ground}
      <DepthStack items={items} crowd={crowd} />
      {season === 'autumn' && <FallingLeaves seed={seed} />}
      {kind === 'park' && <Birds y={150} n={6} delay={-8} />}
      {kind !== 'park' && <Birds y={220} n={4} delay={-20} dur={60} />}
    </>
  )

  const lightsNode = (
    <>
      {lampXs.map((x) => (
        <LampGlow key={x} x={x} y={lampY} style={lampStyle} />
      ))}
      {/* отражения фонарей на мокрой земле: вытянутые размытые столбы света */}
      <g style={{ opacity: 'calc(var(--wet) * (0.35 + var(--lamps) * 0.65))' }}>
        {lampXs.map((x) => (
          <g key={x} style={{ mixBlendMode: 'screen' }}>
            <rect x={x - 10} y={lampY + 6} width="20" height="120" rx="10" fill="url(#refl-warm)" />
            <ellipse cx={x} cy={lampY + 30} rx="60" ry="10" fill="url(#glow-soft)" />
          </g>
        ))}
        {art.wetLights}
      </g>
      {art.lights}
      {/* закатное/утреннее солнце: ореол + косые лучи */}
      <g style={{ transform: 'translate(calc(var(--sun-x) * 1600px), calc(var(--sun-y) * 560px))', opacity: 'calc(var(--golden) * var(--sun-o) * 0.9)' }}>
        <circle r="520" fill="url(#glow-warm)" style={{ mixBlendMode: 'screen' }} />
      </g>
      <g style={{ transform: 'translate(calc(var(--sun-x) * 1600px), calc(var(--sun-y) * 560px))', opacity: 'calc(var(--sun-o) * 0.75)' }}>
        <circle r="220" fill="url(#glow-warm)" style={{ mixBlendMode: 'screen' }} />
      </g>
      <g className="hi-detail" style={{ opacity: 'calc(var(--golden) * var(--sun-o) * 0.35)', mixBlendMode: 'screen' }}>
        {[0, 1, 2, 3].map((i) => <path key={i} d={`M${200 + i * 360} -40 L${280 + i * 360} -40 L${520 + i * 340} 900 L${380 + i * 340} 900 Z`} fill="url(#cone-g)" />)}
      </g>
      {/* атмосферная дымка у земли */}
      <g className="fog-far">
        {[0, 1, 2].map((i) => (
          <ellipse key={i} className="haze ambient-anim" cx={300 + i * 520} cy={kind === 'park' ? 640 + i * 28 : 600 + i * 30} rx={560} ry={46 + i * 10} fill="url(#haze-g)" opacity={0.55 - i * 0.12} style={{ animation: `haze-drift ${22 + i * 7}s ease-in-out ${-i * 6}s infinite alternate` }} />
        ))}
      </g>
    </>
  )

  // bloom — только источники света: плафоны фонарей и солнце
  const bloomNode = (
    <>
      <SunBloom />
      <g className="lamp-lit">
        {lampXs.map((x) => <circle key={x} cx={x + (lampStyle === 'modern' ? 28 : 0)} cy={lampY - (lampStyle === 'classic' ? 193 : lampStyle === 'double' ? 174 : 188)} r="20" fill="#ffd9a0" />)}
      </g>
      {art.bloom}
    </>
  )

  return (
    <SceneShell
      sky={<SkyLayer horizon={640} />}
      clouds={7}
      back={art.far}
      mid={art.mid}
      art={artNode}
      fore={art.foreground}
      foreSway
      lights={lightsNode}
      bloom={bloomNode}
      depths={{ back: 4, mid: 7, art: 0, fore: 16 }}
    />
  )
}

/** Объекты по y основания, между ними — полосы толпы с соответствующей глубиной. */
function DepthStack({ items, crowd }: { items: DepthItem[]; crowd: Crowd }) {
  const sorted = [...items].sort((a, b) => a.y - b.y)
  let prev = -Infinity
  return (
    <>
      {sorted.map((it) => {
        const band = <EntityBand crowd={crowd} yMin={prev} yMax={it.y} />
        prev = it.y
        return (
          <Fragment key={it.key}>
            {band}
            {it.node}
          </Fragment>
        )
      })}
      <EntityBand crowd={crowd} yMin={prev} />
    </>
  )
}

// ───────── сборка статичного арта ─────────
interface ArtParts {
  far: ReactNode
  mid: ReactNode
  ground: ReactNode
  props: DepthItem[]
  foreground: ReactNode
  lights: ReactNode
  wetLights: ReactNode
  bloom: ReactNode
}

function FarCity({ theme, seed, baseY }: { theme: SceneTheme; seed: number; baseY: number }) {
  const rng = mulberry32(seed)
  const wall = theme.wall
  return (
    <g>
      {Array.from({ length: 18 }, (_, i) => {
        const w = 70 + rng() * 90
        const h = 70 + rng() * 150
        return <Building key={i} x={-40 + i * 100} w={w} h={h} y={baseY} color={wall[i % wall.length]} seed={seed + i} haze={0.62} hazeColor="#a4acd0" lit={0.3} snow={false} detail={0} />
      })}
      <Landmark theme={theme} baseY={baseY} haze={0.3} />
      {/* воздушная перспектива: дальний план растворяется в цвете неба */}
      <rect x="-200" y={baseY - 330} width="2000" height="340" fill="url(#atmo)" opacity=".75" />
      <rect x="-200" y={baseY - 200} width="2000" height="210" className="fog-far" fill="#dfe3ee" opacity=".5" />
    </g>
  )
}

function buildArt(kind: Kind, theme: SceneTheme, id: LocationId, season: Season, seed: number, isBusStop: boolean, pedStreet: boolean, style: StreetStyle): ArtParts {
  const rng = mulberry32(seed)
  const wall = theme.wall
  const props: DepthItem[] = []
  let mid: ReactNode = null
  let ground: ReactNode = null
  let foreground: ReactNode = null
  let lights: ReactNode = null
  let wetLights: ReactNode = null
  let bloom: ReactNode = null
  const far = <FarCity theme={theme} seed={seed} baseY={kind === 'park' ? 600 : 580} />

  if (kind === 'street') {
    const row: ReactNode[] = []
    const bays: number[] = []
    let x = -80
    let i = 0
    while (x < 1700) {
      const w = 170 + rng() * 120
      const h = style.h[0] + rng() * (style.h[1] - style.h[0])
      row.push(
        <Building key={i} x={x} w={w} h={h} y={640} color={wall[i % wall.length]} seed={seed + i * 3} roof={style.roofs[Math.floor(rng() * style.roofs.length)]} shopfront lit={0.5} balconies={style.facade !== 'modern' && rng() < 0.35} facade={style.facade} detail={2} />,
      )
      bays.push(x + w / 2)
      x += w + (style.facade === 'modern' ? 18 : 0)
      i++
    }
    mid = (
      <g>
        {row}
        {style.wires && <Wires y={470} seed={seed} />}
        {pedStreet && <Wires y={430} seed={seed + 1} />}
      </g>
    )
    const road = !pedStreet
    ground = (
      <g>
        <rect x="-200" y="636" width="2000" height="290" fill={theme.groundBottom} />
        {/* дальний тротуар: плитка */}
        <rect x="-200" y="636" width="2000" height="46" fill={mixHex(theme.groundTop, '#ffffff', 0.1)} />
        <rect x="-200" y="636" width="2000" height="46" fill="url(#pat-paving)" />
        <rect x="-200" y="636" width="2000" height="12" fill="url(#ao-down)" opacity=".55" />
        {road ? (
          <g>
            <Curb y={680} />
            <rect x="-200" y="688" width="2000" height="68" fill="#3a3846" />
            <rect x="-200" y="688" width="2000" height="68" fill="url(#tex-asphalt)" />
            <rect x="-200" y="688" width="2000" height="68" fill="url(#tex-blotch)" opacity=".35" />
            {/* разметка: прерывистая осевая, стоп-линия, зебра */}
            {Array.from({ length: 14 }, (_, k) => <rect key={k} x={k * 130 - 40} y="719" width="70" height="3.5" fill="#e8e2d0" opacity=".6" />)}
            <Zebra x={640} y0={690} y1={754} w={190} />
            <rect x="606" y="690" width="5" height="64" fill="#e8e2d0" opacity=".55" />
            {/* люк и трещины */}
            <ellipse cx="1180" cy="740" rx="22" ry="5" fill="#2a2834" />
            <ellipse cx="1180" cy="739" rx="18" ry="3.5" fill="none" stroke="#55525e" strokeWidth="1" />
            <path d="M260 700 l30 6 l18 -3 l26 9 M1380 744 l-24 -6 l-30 3" stroke="#24222c" strokeWidth="1.2" fill="none" opacity=".6" />
            <Curb y={754} />
          </g>
        ) : (
          <g>
            {/* пешеходная улица: брусчатка во всю ширину */}
            <rect x="-200" y="682" width="2000" height="80" fill={mixHex(theme.groundTop, '#e0c8a8', 0.3)} />
            <rect x="-200" y="682" width="2000" height="80" fill="url(#pat-paving)" />
            <rect x="-200" y="682" width="2000" height="80" fill="url(#tex-blotch)" opacity=".3" />
            <rect x="-200" y="718" width="2000" height="10" fill="#fff" opacity=".07" />
          </g>
        )}
        {/* ближний тротуар */}
        <rect x="-200" y="762" width="2000" height="160" fill={theme.groundTop} />
        <rect x="-200" y="762" width="2000" height="160" fill="url(#pat-paving)" />
        <rect x="-200" y="762" width="2000" height="160" fill="url(#tex-grain)" opacity=".45" />
        <rect x="-200" y="830" width="2000" height="100" fill="url(#ao-up)" opacity=".45" />
        {/* снег: покров, колея, следы */}
        <g className="snow-cap">
          <rect x="-200" y="636" width="2000" height="46" fill={SNOW} opacity=".95" />
          <rect x="-200" y="762" width="2000" height="160" fill={SNOW} opacity=".95" />
          <rect x="-200" y="762" width="2000" height="160" fill="url(#tex-grain)" opacity=".25" />
          <rect x="-200" y="688" width="2000" height="68" fill={SNOW} opacity=".5" />
          <path d="M-200 708 H1800 M-200 742 H1800" stroke="#7a7a8a" strokeWidth="8" opacity=".35" />
        </g>
        <Footprints x0={40} x1={1560} y={786} seed={seed} />
        {/* мокрый асфальт: глянцевые полосы-отражения неба */}
        <g className="wet-sheen">
          <rect x="-200" y="688" width="2000" height="68" fill="url(#sky-refl)" opacity=".35" />
          <rect x="-200" y="688" width="2000" height="68" fill="url(#tex-streak)" opacity=".35" />
          <rect x="-200" y="762" width="2000" height="160" fill="#9fb3e0" opacity=".14" />
        </g>
        <Puddles items={[{ x: 300, y: 730, w: 90 }, { x: 900, y: 798, w: 120 }, { x: 1320, y: 724, w: 80 }]} />
        {season === 'autumn' && <FallenLeaves x0={0} x1={1600} y={770} seed={seed} h={60} />}
      </g>
    )
    // пропсы у дальнего бордюра (за машинами, перед дальними прохожими)
    props.push({
      y: 684, key: 'far-curb', node: (
        <g>
          {[180, 620, 1060, 1500].map((lx) => <Lamp key={lx} x={lx} y={684} s={1} style={style.lamp} />)}
          {[330, 860, 1330].map((tx, k) => <Tree key={tx} x={tx} y={680} s={0.72} season={season} seed={seed + k} kind={k % 2 ? 'lime' : 'round'} />)}
          {!pedStreet && <TrafficLight x={600} y={684} />}
          {!pedStreet && <RoadSign x={846} y={684} kind="crossing" />}
          {pedStreet && <Kiosk x={980} y={680} label={id === 'arbat' ? 'КНИГИ' : 'ЦВЕТЫ'} s={0.85} />}
          <Bin x={470} y={684} s={0.9} />
          <SnowDrift x={60} y={684} w={70} />
        </g>
      ),
    })
    // ближний бордюр/тротуар — перед машинами, но позади прохожих ближней полосы
    props.push({
      y: 776, key: 'near', node: (
        <g>
          {!pedStreet && [700, 800].map((bx) => (
            <g key={bx}><rect x={bx - 3} y="752" width="6" height="22" rx="2" fill="url(#dark-metal-v)" /><ellipse cx={bx} cy="775" rx="6" ry="2" fill="url(#contact)" /></g>
          ))}
          <SnowDrift x={120} y={790} w={130} />
          <SnowDrift x={1480} y={790} w={150} />
        </g>
      ),
    })
    foreground = (
      <g>
        <Tree x={-30} y={960} s={2} season={season} seed={seed + 99} still />
        <rect x="1560" y="0" width="40" height="0" fill="none" />
      </g>
    )
    // свет витрин на тротуаре и его отражения на мокром асфальте
    lights = (
      <g className="lamp-lit">
        {bays.map((bx, k) => <ellipse key={k} cx={bx} cy="652" rx="110" ry="14" fill="url(#glow-soft)" style={{ mixBlendMode: 'screen' }} />)}
      </g>
    )
    wetLights = (
      <g>
        {bays.map((bx, k) => <rect key={k} x={bx - 50} y="690" width="100" height="70" fill="url(#refl-warm)" opacity=".6" style={{ mixBlendMode: 'screen' }} />)}
      </g>
    )
    if (!pedStreet) lights = <>{lights}<g className="night-only"><TrafficGlow x={600} y={684} /></g></>
    void isBusStop
  } else if (kind === 'park') {
    const treeLine: ReactNode[] = []
    for (let i = 0; i < 13; i++) {
      treeLine.push(<Tree key={i} x={-20 + i * 140 + rng() * 40} y={640 + rng() * 14} s={0.66 + rng() * 0.3} season={season} seed={seed + i * 5} kind={id === 'zaryadye' && i % 4 === 0 ? 'pine' : i % 5 === 2 ? 'birch' : 'lime'} still />)
    }
    mid = <g>{treeLine}</g>
    const river = id === 'gorky-park' || id === 'zaryadye' || id === 'neskuchny'
    const pond = id === 'patriarshy'
    ground = (
      <g>
        <rect x="-200" y="600" width="2000" height="320" fill={theme.groundBottom} />
        <Lawn x0={-200} x1={1800} y={600} h={140} season={season} seed={seed} />
        <g className="snow-cap">
          <rect x="-200" y="600" width="2000" height="320" fill={SNOW} opacity=".92" />
          <rect x="-200" y="600" width="2000" height="320" fill="url(#tex-blotch)" opacity=".2" />
        </g>
        {river && (
          <g>
            <rect x="-200" y="594" width="2000" height="56" fill="#4e7896" />
            <rect x="-200" y="594" width="2000" height="56" fill="url(#sky-refl)" opacity=".6" />
            <g className="ambient-anim" style={{ animation: 'water-shimmer 30s linear infinite' }}>
              <rect x="-200" y="596" width="2600" height="50" fill="url(#tex-streak)" opacity=".5" />
            </g>
            {/* гранитная набережная с балюстрадой */}
            <rect x="-200" y="646" width="2000" height="16" fill="#a89a8a" />
            <rect x="-200" y="646" width="2000" height="16" fill="url(#tex-grain)" opacity=".5" />
            <rect x="-200" y="646" width="2000" height="3" fill="#d8ccbc" />
            <path d={Array.from({ length: 70 }, (_, k) => `M${k * 26 - 10} 640 v-16`).join('')} stroke="#4a4652" strokeWidth="5" opacity=".75" />
            <rect x="-200" y="620" width="2000" height="5" fill="#3e3a46" opacity=".8" />
          </g>
        )}
        {pond && (
          <g>
            <ellipse cx="410" cy="668" rx="384" ry="48" fill="#a89a8a" />
            <ellipse cx="410" cy="666" rx="362" ry="38" fill="#4e7896" />
            <ellipse cx="410" cy="663" rx="330" ry="30" fill="url(#sky-refl)" opacity=".55" />
            <Ducks />
          </g>
        )}
        {id === 'vdnh' && <Fountain x={1120} y={680} s={0.8} />}
        {/* дорожка: гравий с бордюрным камнем */}
        <path d="M-200 722 Q400 704 800 728 T1800 720 L1800 812 Q1200 800 800 814 T-200 808 Z" fill="#c4b496" />
        <path d="M-200 722 Q400 704 800 728 T1800 720 L1800 812 Q1200 800 800 814 T-200 808 Z" fill="url(#tex-grain)" opacity=".6" />
        <path d="M-200 722 Q400 704 800 728 T1800 720 L1800 812 Q1200 800 800 814 T-200 808 Z" fill="url(#tex-blotch)" opacity=".3" />
        <path d="M-200 722 Q400 704 800 728 T1800 720" stroke="#9a8a72" strokeWidth="4" fill="none" />
        <path d="M-200 720 Q400 702 800 726 T1800 718" stroke="#fff" strokeWidth="1.5" fill="none" opacity=".3" />
        <g className="snow-cap">
          <path d="M-200 722 Q400 704 800 728 T1800 720 L1800 812 Q1200 800 800 814 T-200 808 Z" fill="#e6ecf8" opacity=".85" />
          <Footprints x0={20} x1={1580} y={770} seed={seed + 3} />
        </g>
        <g className="wet-sheen">
          <path d="M-200 722 Q400 704 800 728 T1800 720 L1800 812 Q1200 800 800 814 T-200 808 Z" fill="url(#sky-refl)" opacity=".3" />
        </g>
        <Puddles items={[{ x: 640, y: 770, w: 130 }, { x: 1080, y: 764, w: 100 }]} />
        {season === 'autumn' && <FallenLeaves x0={0} x1={1600} y={730} seed={seed} h={80} />}
        <Pigeons x={880} y={790} n={4} />
      </g>
    )
    props.push({
      y: 712, key: 'park-back', node: (
        <g>
          {[80, 330, 1450, 1560].map((tx, k) => <Tree key={tx} x={tx} y={704 + (k % 2) * 6} s={0.88 + (k % 3) * 0.08} season={season} seed={seed + 40 + k} kind={k === 2 ? 'birch' : 'lime'} />)}
          <Bush x={420} y={712} s={0.9} season={season} seed={seed + 1} flowers />
          <Bush x={1150} y={716} s={1} season={season} seed={seed + 2} />
          <Bush x={1240} y={712} s={0.7} season={season} seed={seed + 3} flowers />
        </g>
      ),
    })
    props.push({
      y: 718, key: 'park-lamps', node: (
        <g>
          {[240, 760, 1300].map((lx) => <Lamp key={lx} x={lx} y={718} s={1} style="classic" />)}
          <Bin x={300} y={720} s={0.85} />
        </g>
      ),
    })
    foreground = (
      <g>
        <Tree x={1650} y={950} s={1.9} season={season} seed={seed + 77} kind="lime" still />
        <Tree x={-60} y={960} s={1.7} season={season} seed={seed + 78} kind="round" still />
        <SnowDrift x={90} y={900} w={140} />
      </g>
    )
  } else {
    // двор: панельки/кирпич, качели, бельё, гаражная тень
    mid = (
      <g>
        <Building x={-60} w={560} h={470} y={660} color={wall[0]} seed={seed + 1} lit={0.55} balconies floors={7} facade="panel" detail={2} />
        <Building x={520} w={440} h={340} y={660} color={wall[1]} seed={seed + 2} lit={0.45} balconies haze={0.1} floors={5} facade="brick" detail={1} roof="pitched" />
        <Building x={980} w={680} h={500} y={660} color={wall[2]} seed={seed + 3} lit={0.55} balconies floors={8} facade="panel" detail={2} />
        <Laundry x={120} y={330} w={170} seed={seed} />
        <Laundry x={1180} y={280} w={220} seed={seed + 4} />
      </g>
    )
    ground = (
      <g>
        <rect x="-200" y="656" width="2000" height="264" fill={theme.groundBottom} />
        <rect x="-200" y="656" width="2000" height="264" fill="url(#tex-asphalt)" opacity=".7" />
        <ellipse cx="900" cy="760" rx="520" ry="46" fill="#5e7a4a" />
        <ellipse cx="900" cy="760" rx="520" ry="46" fill="url(#tex-foliage)" opacity=".5" />
        <rect x="-200" y="656" width="2000" height="60" fill={theme.groundTop} />
        <rect x="-200" y="656" width="2000" height="60" fill="url(#pat-paving)" />
        <rect x="-200" y="770" width="2000" height="150" fill={theme.groundTop} />
        <rect x="-200" y="770" width="2000" height="150" fill="url(#tex-grain)" opacity=".4" />
        <ellipse cx="1460" cy="752" rx="90" ry="12" fill="#d0b880" />
        <g className="snow-cap"><rect x="-200" y="656" width="2000" height="264" fill={SNOW} opacity=".9" /><Footprints x0={60} x1={1500} y={782} seed={seed + 9} /></g>
        <g className="wet-sheen"><rect x="-200" y="656" width="2000" height="264" fill="url(#sky-refl)" opacity=".25" /></g>
        <Puddles items={[{ x: 860, y: 792, w: 130 }]} />
        {season === 'autumn' && <FallenLeaves x0={0} x1={1600} y={776} seed={seed} />}
      </g>
    )
    props.push({
      y: 730, key: 'yard-back', node: (
        <g>
          <Bush x={560} y={730} s={1.1} season={season} seed={seed + 5} />
          <Lamp x={430} y={730} s={1} />
          <Lamp x={1420} y={730} s={1} />
          <Bin x={1500} y={732} s={0.9} />
        </g>
      ),
    })
    props.push({
      y: 760, key: 'yard-mid', node: (
        <g>
          <Tree x={250} y={760} s={1.3} season={season} seed={seed + 8} />
          <Tree x={1540} y={760} s={1.2} season={season} seed={seed + 9} kind="birch" />
          <Swing x={1000} y={760} />
        </g>
      ),
    })
    foreground = <Tree x={1680} y={960} s={1.8} season={season} seed={seed + 11} still />
  }
  bloom = null
  return { far, mid, ground, props, foreground, lights, wetLights, bloom }
}
