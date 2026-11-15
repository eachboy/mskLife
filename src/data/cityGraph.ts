/**
 * Граф города: узлы (места, выходы, вестибюли и платформы метро, остановки) и рёбра
 * (пешком, метро, автобус, такси, трамвай). Строится из данных locations.ts + transit.ts.
 * Локальная модель основных маршрутов — не реальное расписание (см. transit.ts).
 */
import type { LocationId, TravelMode } from '../types'
import { LOCATIONS } from './locations'
import {
  BUS_DWELL,
  BUS_KMH_DAY,
  BUS_KMH_NIGHT,
  BUS_STOPS,
  DAY_SERVICE,
  DETOUR,
  MAX_PLACE_WALK_KM,
  MAX_STOP_LINK_KM,
  MAX_WALK_LINK_KM,
  METRO_KMH,
  METRO_LINES,
  METRO_MIN_HOP,
  METRO_STATIONS,
  METRO_TRANSFERS,
  NIGHT_SERVICE,
  PLACES,
  SURFACE_ROUTES,
  WALK_KMH,
  busHeadway,
  metroHeadway,
  taxiKmh,
  taxiWait,
} from './transit'

export type NodeId = string

export type CityNodeType = 'place' | 'gate' | 'metro-entrance' | 'metro-platform' | 'bus-stop' | 'building'

export interface CityNode {
  id: NodeId
  type: CityNodeType
  /** название для подписи: «Парк Горького», «Охотный Ряд», «Пушкинская площадь» */
  name: string
  district: string
  /** условные координаты, км от Кремля (x — восток, y — север) */
  x: number
  y: number
  /** ближайшее уличное место — какую сцену показывать вокруг узла */
  area: LocationId
  /** для метро: id станции (платформы) и линии */
  station?: string
  line?: string
}

/** Окно доступности в часах; `to` может быть > 24 (через полночь). */
export interface Availability {
  from: number
  to: number
}

export type CityEdgeKind = 'inner' | 'street' | 'access-in' | 'access-out' | 'transfer' | 'ride'

export interface CityEdge {
  from: NodeId
  to: NodeId
  mode: TravelMode
  kind: CityEdgeKind
  /** длительность, мин (если нет timeAt) */
  minutes: number
  /** длина по улицам/путям, км */
  km: number
  /** линия/маршрут для kind === 'ride' */
  line?: string
  /** когда ребро можно пройти (по часам начала); нет — всегда */
  availability?: Availability[]
  /** длительность в зависимости от времени (такси в пробке, ночной автобус) */
  timeAt?: (minutes: number) => number
}

export interface LineInfo {
  id: string
  name: string
  color: string
  mode: TravelMode
  /** интервал (или ожидание такси), мин — «худший случай» ожидания */
  headway: (minutes: number) => number
  /** когда можно сесть (нет — всегда) */
  board?: Availability[]
  /** подход поезда/автобуса, посадка, валидация, мин */
  boardOverhead?: number
  /** выход из вагона/салона, мин */
  alightOverhead?: number
  title?: string
}

export interface CityGraph {
  nodes: Map<NodeId, CityNode>
  edges: CityEdge[]
  out: Map<NodeId, CityEdge[]>
  lines: Map<string, Required<Pick<LineInfo, 'boardOverhead' | 'alightOverhead'>> & LineInfo>
}

const OVERHEAD: Record<TravelMode, [board: number, alight: number]> = {
  walk: [0, 0],
  metro: [1, 1],
  bus: [2, 1],
  tram: [2, 1],
  taxi: [3, 1],
}

export function buildGraph(nodes: CityNode[], edges: CityEdge[], lines: Map<string, LineInfo>): CityGraph {
  const out = new Map<NodeId, CityEdge[]>()
  for (const e of edges) {
    const list = out.get(e.from)
    if (list) list.push(e)
    else out.set(e.from, [e])
  }
  const full = new Map<string, LineInfo & { boardOverhead: number; alightOverhead: number }>()
  for (const [id, l] of lines) {
    const [b, a] = OVERHEAD[l.mode]
    full.set(id, { ...l, boardOverhead: l.boardOverhead ?? b, alightOverhead: l.alightOverhead ?? a })
  }
  return { nodes: new Map(nodes.map((n) => [n.id, n])), edges, out, lines: full }
}

// ───────── координаты ─────────

const LAT0 = 55.752
const LNG0 = 37.6175
const KM_LAT = 111.13
const KM_LNG = 111.32 * Math.cos((LAT0 * Math.PI) / 180)

/** lat/lng → условные км от Кремля. */
export function toKm(lat: number, lng: number): { x: number; y: number } {
  return { x: (lng - LNG0) * KM_LNG, y: (lat - LAT0) * KM_LAT }
}

export const kmBetween = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

// ───────── id узлов ─────────

export const placeNode = (id: LocationId): NodeId => `place:${id}`
export const gateNode = (id: LocationId): NodeId => `gate:${id}`
export const entranceNode = (stationId: string): NodeId => `mv:${stationId}`
export const platformNode = (stationId: string): NodeId => `mp:${stationId}`
export const stopNode = (stopId: string): NodeId => `bs:${stopId}`
/** Здание (кофейня, офис, дом…) у уличного места. В граф не входит: вход/выход — короткое событие. */
export const buildingNode = (scene: LocationId, anchor: LocationId): NodeId => `bld:${scene}@${anchor}`

export function parseBuilding(id: NodeId): { scene: LocationId; anchor: LocationId } | null {
  const m = /^bld:([^@]+)@(.+)$/.exec(id)
  return m ? { scene: m[1] as LocationId, anchor: m[2] as LocationId } : null
}

export const PLACE_IDS: LocationId[] = PLACES.map((p) => p.id)

/** Уличное место, в котором логично находится помещение/сцена (для старого API). */
export function placeFor(loc: LocationId): LocationId {
  if (PLACE_IDS.includes(loc)) return loc
  const fixed: Partial<Record<LocationId, LocationId>> = {
    home: 'courtyard',
    office: 'moscow-city',
    cafe: 'khamovniki',
    shop: 'arbat',
    'bus-stop': 'tverskaya',
  }
  if (fixed[loc]) return fixed[loc]
  const d = LOCATIONS[loc]
  return nearestPlace(toKm(d.lat, d.lng))
}

const PLACE_KM = PLACE_IDS.map((id) => ({ id, ...toKm(LOCATIONS[id].lat, LOCATIONS[id].lng) }))

export function nearestPlace(p: { x: number; y: number }): LocationId {
  let best = PLACE_KM[0]
  let bd = Number.POSITIVE_INFINITY
  for (const q of PLACE_KM) {
    const d = kmBetween(p, q)
    if (d < bd) {
      bd = d
      best = q
    }
  }
  return best.id
}

// ───────── построение графа Москвы ─────────

const walkMinutes = (straightKm: number) => Math.max(1, Math.round(((straightKm * DETOUR) / WALK_KMH) * 60 * 10) / 10)

function buildMoscow(): CityGraph {
  const nodes: CityNode[] = []
  const edges: CityEdge[] = []
  const lines = new Map<string, LineInfo>()
  const pos = new Map<NodeId, { x: number; y: number }>()
  const add = (n: CityNode) => {
    nodes.push(n)
    pos.set(n.id, { x: n.x, y: n.y })
  }
  const both = (e: CityEdge, back?: Partial<CityEdge>) => {
    edges.push(e)
    edges.push({ ...e, from: e.to, to: e.from, ...back })
  }
  const district = (area: LocationId) => LOCATIONS[area].district

  // места и их выходы
  for (const p of PLACES) {
    const def = LOCATIONS[p.id]
    const c = toKm(def.lat, def.lng)
    add({ id: placeNode(p.id), type: 'place', name: def.name, district: def.district, ...c, area: p.id })
    const g = toKm(p.gate.lat, p.gate.lng)
    add({ id: gateNode(p.id), type: 'gate', name: p.gate.name, district: def.district, ...g, area: p.id })
    both({
      from: placeNode(p.id),
      to: gateNode(p.id),
      mode: 'walk',
      kind: 'inner',
      minutes: p.inner,
      km: (p.inner / 60) * WALK_KMH,
    })
  }

  // метро
  const day: Availability[] = [DAY_SERVICE]
  const rideOn: Availability[] = [{ from: DAY_SERVICE.from, to: DAY_SERVICE.to + 0.75 }]
  for (const s of METRO_STATIONS) {
    const c = toKm(s.lat, s.lng)
    const area = nearestPlace(c)
    const base = { name: s.name, district: district(area), ...c, area, station: s.id, line: s.line }
    add({ id: entranceNode(s.id), type: 'metro-entrance', ...base })
    add({ id: platformNode(s.id), type: 'metro-platform', ...base })
    // вход: вестибюль (1) + турникет (1) + эскалатор; выход: эскалатор + выход (1)
    edges.push({
      from: entranceNode(s.id),
      to: platformNode(s.id),
      mode: 'walk',
      kind: 'access-in',
      minutes: 2 + s.escalator,
      km: 0.15,
      availability: day,
    })
    edges.push({
      from: platformNode(s.id),
      to: entranceNode(s.id),
      mode: 'walk',
      kind: 'access-out',
      minutes: 1 + s.escalator,
      km: 0.15,
    })
  }
  const stationPos = (id: string) => pos.get(platformNode(id))!
  for (const l of METRO_LINES) {
    lines.set(l.id, { id: l.id, name: l.name, color: l.color, mode: 'metro', headway: metroHeadway, board: day })
    const seq = l.ring ? [...l.stations, l.stations[0]] : l.stations
    for (let i = 0; i < seq.length - 1; i++) {
      const km = kmBetween(stationPos(seq[i]), stationPos(seq[i + 1])) * 1.15
      const minutes = Math.max(METRO_MIN_HOP, Math.round(((km / METRO_KMH) * 60 + 0.5) * 10) / 10)
      both({
        from: platformNode(seq[i]),
        to: platformNode(seq[i + 1]),
        mode: 'metro',
        kind: 'ride',
        minutes,
        km,
        line: l.id,
        availability: rideOn,
      })
    }
  }
  for (const t of METRO_TRANSFERS) {
    both({
      from: platformNode(t.a),
      to: platformNode(t.b),
      mode: 'walk',
      kind: 'transfer',
      minutes: t.minutes,
      km: t.minutes * 0.07,
      availability: [{ from: DAY_SERVICE.from, to: DAY_SERVICE.to + 0.5 }],
    })
  }

  // остановки и наземные маршруты
  for (const s of BUS_STOPS) {
    const c = toKm(s.lat, s.lng)
    const area = nearestPlace(c)
    add({ id: stopNode(s.id), type: 'bus-stop', name: s.name, district: district(area), ...c, area })
  }
  for (const r of SURFACE_ROUTES) {
    const night = !!r.night
    const svc = night ? NIGHT_SERVICE : DAY_SERVICE
    lines.set(r.id, {
      id: r.id,
      name: r.name,
      title: r.title,
      color: r.color,
      mode: r.mode,
      headway: (m) => busHeadway(m, night),
      board: [svc],
    })
    const kmh = night ? BUS_KMH_NIGHT : BUS_KMH_DAY
    for (let i = 0; i < r.stops.length - 1; i++) {
      const a = stopNode(r.stops[i])
      const b = stopNode(r.stops[i + 1])
      const km = kmBetween(pos.get(a)!, pos.get(b)!) * 1.25
      both({
        from: a,
        to: b,
        mode: r.mode,
        kind: 'ride',
        minutes: Math.max(2, Math.round(((km / kmh) * 60 + BUS_DWELL) * 10) / 10),
        km,
        line: r.id,
        availability: [{ from: svc.from, to: svc.to + 0.75 }],
      })
    }
  }

  // пешие связи
  const gates = PLACES.map((p) => ({ id: gateNode(p.id), ...pos.get(gateNode(p.id))! }))
  const entrances = METRO_STATIONS.map((s) => ({ id: entranceNode(s.id), ...pos.get(entranceNode(s.id))! }))
  const stops = BUS_STOPS.map((s) => ({ id: stopNode(s.id), ...pos.get(stopNode(s.id))! }))
  const link = (a: { id: string; x: number; y: number }, b: { id: string; x: number; y: number }) => {
    const d = kmBetween(a, b)
    both({ from: a.id, to: b.id, mode: 'walk', kind: 'street', minutes: walkMinutes(d), km: d * DETOUR })
  }
  for (const g of gates) {
    const near = (list: typeof entrances, max: number, k: number) =>
      list
        .map((n) => ({ n, d: kmBetween(g, n) }))
        .filter((o) => o.d <= max)
        .sort((p, q) => p.d - q.d)
        .slice(0, k)
    for (const { n } of near(entrances, MAX_WALK_LINK_KM, 5)) link(g, n)
    for (const { n } of near(stops, MAX_STOP_LINK_KM, 3)) link(g, n)
  }
  for (let i = 0; i < gates.length; i++)
    for (let j = i + 1; j < gates.length; j++)
      if (kmBetween(gates[i], gates[j]) <= MAX_PLACE_WALK_KM) link(gates[i], gates[j])

  // такси: от любого выхода к любому (по дорогам ≈ ×1.35)
  lines.set('taxi', { id: 'taxi', name: 'такси', color: '#f5c518', mode: 'taxi', headway: taxiWait })
  for (const a of gates)
    for (const b of gates) {
      if (a.id === b.id) continue
      const km = kmBetween(a, b) * 1.35
      edges.push({
        from: a.id,
        to: b.id,
        mode: 'taxi',
        kind: 'ride',
        line: 'taxi',
        km,
        minutes: Math.max(4, (km / 24) * 60 + 2),
        timeAt: (m) => Math.max(4, Math.round(((km / taxiKmh(m)) * 60 + 2) * 10) / 10),
      })
    }

  return buildGraph(nodes, edges, lines)
}

export const CITY_GRAPH: CityGraph = buildMoscow()

/** Узел по id; здания (bld:…) достраиваются на лету. */
export function getNode(id: NodeId, graph: CityGraph = CITY_GRAPH): CityNode | undefined {
  const n = graph.nodes.get(id)
  if (n) return n
  const b = parseBuilding(id)
  if (!b) return undefined
  const place = graph.nodes.get(placeNode(b.anchor))
  if (!place) return undefined
  return { ...place, id, type: 'building', name: LOCATIONS[b.scene].name }
}

/** Сцена, в которой виден узел, когда персонаж в нём стоит/сидит. */
export function nodeScene(id: NodeId, graph: CityGraph = CITY_GRAPH): LocationId | null {
  const b = parseBuilding(id)
  if (b) return b.scene
  const n = graph.nodes.get(id)
  if (!n) return null
  switch (n.type) {
    case 'place':
    case 'gate':
      return n.area
    case 'metro-entrance':
    case 'metro-platform':
      return 'metro-station'
    case 'bus-stop':
      return 'bus-stop'
    default:
      return n.area
  }
}

/** Уличное место узла (для якоря/вида за окном). */
export function nodeArea(id: NodeId, graph: CityGraph = CITY_GRAPH): LocationId {
  const b = parseBuilding(id)
  if (b) return b.anchor
  return graph.nodes.get(id)?.area ?? 'arbat'
}

export const isBuilding = (id: NodeId) => id.startsWith('bld:')
export const isPlace = (id: NodeId) => id.startsWith('place:')
