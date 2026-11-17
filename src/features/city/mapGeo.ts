/**
 * Геометрия 2.5D-карты: проекция условных км от Кремля на сетку 1000×1000, пины локаций,
 * изгиб Москвы-реки, кольца и пути рёбер графа (метро — по станциям линии, автобус — по остановкам).
 * Чистые функции без React — покрыты тестами (mapGeo.test.ts).
 */
import { CITY_GRAPH, getNode, type NodeId, parseBuilding, platformNode, stopNode, toKm } from '../../data/cityGraph'
import { LOCATIONS } from '../../data/locations'
import { METRO_LINES, METRO_STATIONS, SURFACE_ROUTES } from '../../data/transit'
import type { LocationId } from '../../types'

export const MAP_SIZE = 1000
export const MAP_CENTER = 500

export interface Pt {
  x: number
  y: number
}

/**
 * Радиальное сжатие: реальные км → единицы сетки. Опорные радиусы подобраны так, чтобы кольца
 * карты совпали с реальными: Бульварное ≈1.4 км → 140, Садовое ≈2.6 км → 220, ТТК ≈5.5 км → 310,
 * спальный пояс ≈9 км → 420. Углы сохраняются, поэтому «Арбат на западе, Сити дальше на западе,
 * ВДНХ на севере» остаётся географически верным.
 */
const RADIAL: [km: number, grid: number][] = [
  [0, 0],
  [1.4, 140],
  [2.6, 220],
  [5.5, 310],
  [9, 420],
  [13, 480],
]

export function compressRadius(km: number): number {
  if (km <= 0) return 0
  for (let i = 1; i < RADIAL.length; i++) {
    const [k0, g0] = RADIAL[i - 1]
    const [k1, g1] = RADIAL[i]
    if (km <= k1) return g0 + ((km - k0) / (k1 - k0)) * (g1 - g0)
  }
  return RADIAL[RADIAL.length - 1][1]
}

/** Условные км от Кремля (x — восток, y — север) → точка сетки (север вверху). */
export function kmToGrid(p: Pt): Pt {
  const r = Math.hypot(p.x, p.y)
  if (r < 1e-9) return { x: MAP_CENTER, y: MAP_CENTER }
  const g = compressRadius(r)
  return { x: MAP_CENTER + (p.x / r) * g, y: MAP_CENTER - (p.y / r) * g }
}

export const latLngToGrid = (lat: number, lng: number): Pt => kmToGrid(toKm(lat, lng))

export const RINGS = [
  { id: 'boulevard', name: 'Бульварное кольцо', r: 140 },
  { id: 'garden', name: 'Садовое кольцо', r: 220 },
  { id: 'ttk', name: 'ТТК', r: 310 },
  { id: 'belt', name: 'Спальный пояс', r: 420 },
] as const

// ───────── пины ─────────

export type PinKind = 'park' | 'street' | 'city' | 'cafe' | 'office' | 'home' | 'shop' | 'courtyard'

export interface MapPin {
  id: LocationId
  name: string
  short: string
  kind: PinKind
  pos: Pt
  /** район для подписи карточки */
  district: string
  blurb: string
}

/** Здания делят координаты с уличным местом — разводим их на карте, чтобы пины не слипались. */
const PIN_OFFSET: Partial<Record<LocationId, Pt>> = {
  cafe: { x: 20, y: -14 },
  office: { x: 22, y: 16 },
  home: { x: -22, y: 14 },
  shop: { x: 18, y: 16 },
}

/** Локации, которые показываются пинами (транспортные сцены — не места). */
const TRANSPORT: LocationId[] = ['metro-station', 'metro-ride', 'bus-stop', 'bus-ride']

function pinKind(id: LocationId): PinKind {
  const d = LOCATIONS[id]
  if (id === 'moscow-city') return 'city'
  if (id === 'courtyard') return 'courtyard'
  if (d.kind === 'park') return 'park'
  if (d.kind === 'street') return 'street'
  if (d.kind === 'office') return 'office'
  if (d.kind === 'home') return 'home'
  if (id === 'shop') return 'shop'
  return 'cafe'
}

/** Минимальное расстояние между пинами на сетке — чтобы диорамы не накладывались. */
export const PIN_MIN_DIST = 40

/**
 * Мягкое «расталкивание» пинов: соседние места (Хамовники/двор/кофейня, Китай-город/Зарядье…) на
 * сетке почти совпали бы. Сдвиг симметричный и малый — относительное расположение сохраняется.
 */
export function declutter(points: Pt[], minDist = PIN_MIN_DIST, iterations = 60): Pt[] {
  const out = points.map((p) => ({ ...p }))
  for (let it = 0; it < iterations; it++) {
    let moved = false
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        let dx = out[j].x - out[i].x
        let dy = out[j].y - out[i].y
        let d = Math.hypot(dx, dy)
        if (d >= minDist) continue
        if (d < 1e-6) {
          // совпавшие точки разводим детерминированно (по индексу), без Math.random
          const a = (i * 2.399 + j) % (Math.PI * 2)
          dx = Math.cos(a)
          dy = Math.sin(a)
          d = 1
        }
        const push = (minDist - d) / 2 + 0.01
        out[i].x -= (dx / d) * push
        out[i].y -= (dy / d) * push
        out[j].x += (dx / d) * push
        out[j].y += (dy / d) * push
        moved = true
      }
    if (!moved) break
  }
  return out
}

const RAW_PINS = (Object.keys(LOCATIONS) as LocationId[])
  .filter((id) => !TRANSPORT.includes(id))
  .map((id) => {
    const d = LOCATIONS[id]
    const base = latLngToGrid(d.lat, d.lng)
    const off = PIN_OFFSET[id] ?? { x: 0, y: 0 }
    return {
      id,
      name: d.name,
      short: d.short,
      kind: pinKind(id),
      pos: { x: base.x + off.x, y: base.y + off.y },
      district: d.district,
      blurb: d.blurb,
    }
  })

const SPREAD = declutter(RAW_PINS.map((p) => p.pos))
export const MAP_PINS: MapPin[] = RAW_PINS.map((p, i) => ({ ...p, pos: SPREAD[i] }))

const PIN_BY_ID = new Map(MAP_PINS.map((p) => [p.id, p]))
export const pinFor = (id: LocationId): MapPin | undefined => PIN_BY_ID.get(id)

// ───────── узлы графа ─────────

/** Положение узла графа на сетке. Здания (bld:…) ставятся на пин своей сцены. */
export function nodeGrid(id: NodeId): Pt | null {
  const b = parseBuilding(id)
  if (b) {
    const pin = PIN_BY_ID.get(b.scene) ?? PIN_BY_ID.get(b.anchor)
    if (pin) return pin.pos
  }
  const n = getNode(id)
  return n ? kmToGrid({ x: n.x, y: n.y }) : null
}

// ───────── Москва-река ─────────

/** Ориентиры русла (lat, lng): Сити → Киевский → Лужники (излучина) → Парк Горького → Кремль → Зарядье → юго-восток. */
const RIVER_LATLNG: [number, number][] = [
  [55.7592, 37.495],
  [55.7525, 37.52],
  [55.7497, 37.537],
  [55.7485, 37.553],
  [55.7442, 37.5635],
  [55.7345, 37.5585],
  [55.7215, 37.5555],
  [55.7185, 37.5695],
  [55.7235, 37.5855],
  [55.7335, 37.5995],
  [55.7432, 37.6045],
  [55.7462, 37.6095],
  [55.7482, 37.6175],
  [55.7468, 37.6275],
  [55.7405, 37.6445],
  [55.7295, 37.6505],
  [55.7185, 37.6575],
]

export const RIVER_POINTS: Pt[] = RIVER_LATLNG.map(([la, ln]) => latLngToGrid(la, ln))

/** Catmull-Rom → кубические кривые Безье: плавный изгиб реки. */
export function smoothPath(pts: Pt[], tension = 0.5): string {
  if (pts.length < 2) return ''
  const f = (n: number) => Math.round(n * 10) / 10
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1 = { x: p1.x + ((p2.x - p0.x) * tension) / 3, y: p1.y + ((p2.y - p0.y) * tension) / 3 }
    const c2 = { x: p2.x - ((p3.x - p1.x) * tension) / 3, y: p2.y - ((p3.y - p1.y) * tension) / 3 }
    d += `C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`
  }
  return d
}

// ───────── линии метро и автобусов ─────────

export interface MapLine {
  id: string
  name: string
  color: string
  mode: 'metro' | 'bus'
  ring: boolean
  points: Pt[]
  stations: { id: string; name: string; pos: Pt }[]
}

export const METRO_MAP_LINES: MapLine[] = METRO_LINES.map((l) => {
  const stations = l.stations.map((sid) => {
    const s = METRO_STATIONS.find((x) => x.id === sid)
    if (!s) throw new Error(`[mapGeo] нет станции ${sid}`)
    return { id: sid, name: s.name, pos: latLngToGrid(s.lat, s.lng) }
  })
  const points = stations.map((s) => s.pos)
  return {
    id: l.id,
    name: l.name,
    color: l.color,
    mode: 'metro' as const,
    ring: !!l.ring,
    points: l.ring ? [...points, points[0]] : points,
    stations,
  }
})

const BUS_STOP_POS = new Map<string, Pt>()
for (const n of CITY_GRAPH.nodes.values()) {
  if (n.type === 'bus-stop') BUS_STOP_POS.set(n.id, kmToGrid({ x: n.x, y: n.y }))
}

/** Дневные наземные маршруты (ночные дублируют трассу — отдельно не рисуем). */
export const BUS_MAP_LINES: MapLine[] = SURFACE_ROUTES.filter((r) => !r.night).map((r) => {
  const stations = r.stops.map((sid) => {
    const id = stopNode(sid)
    const n = CITY_GRAPH.nodes.get(id)
    return { id, name: n?.name ?? sid, pos: BUS_STOP_POS.get(id) ?? { x: MAP_CENTER, y: MAP_CENTER } }
  })
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    mode: 'bus' as const,
    ring: false,
    points: stations.map((s) => s.pos),
    stations,
  }
})

/** id линии маршрута → id линии на карте (ночной автобус рисуется поверх дневной трассы). */
export const mapLineId = (lineId: string | undefined): string | undefined => lineId?.replace(/-night$/, '')

// ───────── пути ─────────

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

export function polylineLength(pts: Pt[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i])
  return s
}

/** Точка на ломаной на доле p∈[0,1] её длины. */
export function pointAt(pts: Pt[], p: number): Pt {
  if (!pts.length) return { x: MAP_CENTER, y: MAP_CENTER }
  if (pts.length === 1) return pts[0]
  const total = polylineLength(pts)
  if (total < 1e-6) return pts[0]
  let target = Math.min(1, Math.max(0, p)) * total
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i])
    if (target <= seg || i === pts.length - 1) {
      const t = seg < 1e-9 ? 0 : Math.min(1, target / seg)
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }
    }
    target -= seg
  }
  return pts[pts.length - 1]
}

/** Станции/остановки линии между двумя узлами графа (по ходу линии; на кольце — короткой дугой). */
function alongLine(line: MapLine, ids: { from: NodeId; to: NodeId }, toId: (sid: string) => NodeId): Pt[] | null {
  const seq = line.stations.map((s) => s.id)
  const nodeIds = seq.map(toId)
  const a = nodeIds.indexOf(ids.from)
  const b = nodeIds.indexOf(ids.to)
  if (a < 0 || b < 0) return null
  if (a === b) return [line.stations[a].pos]
  const n = seq.length
  const pick = (i: number) => line.stations[((i % n) + n) % n].pos
  if (line.ring) {
    const fwd = (b - a + n) % n
    const back = (a - b + n) % n
    const out: Pt[] = []
    if (fwd <= back) for (let k = 0; k <= fwd; k++) out.push(pick(a + k))
    else for (let k = 0; k <= back; k++) out.push(pick(a - k))
    return out
  }
  const out: Pt[] = []
  const step = b > a ? 1 : -1
  for (let i = a; i !== b + step; i += step) out.push(line.stations[i].pos)
  return out
}

/**
 * Путь одного участка маршрута на карте. Метро и автобус идут по станциям своей линии,
 * пешком и такси — напрямик между узлами графа.
 */
export function legPath(from: NodeId, to: NodeId, lineId?: string): Pt[] {
  const a = nodeGrid(from)
  const b = nodeGrid(to)
  if (!a || !b) return []
  const mid = mapLineId(lineId)
  if (mid) {
    const metro = METRO_MAP_LINES.find((l) => l.id === mid)
    const bus = BUS_MAP_LINES.find((l) => l.id === mid)
    const path = metro
      ? alongLine(metro, { from, to }, platformNode)
      : bus
        ? alongLine(bus, { from, to }, (sid) => sid)
        : null
    if (path && path.length >= 1) return path.length === 1 ? [a, b] : path
  }
  return dist(a, b) < 0.5 ? [a] : [a, b]
}

export const toPathD = (pts: Pt[]): string =>
  pts.length < 2 ? '' : `M${pts.map((p) => `${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`).join('L')}`

// ───────── камера ─────────

export const ZOOM_MIN = 0.75
export const ZOOM_MAX = 2.2
export const DIVE_ZOOM = 2.8
export const YAW_MIN = -35
export const YAW_MAX = 15
export const YAW_DEFAULT = -12
export const TILT = 52
export const PAN_LIMIT = 520

export const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Сдвиг карты (плоскостные единицы), при котором точка p оказывается в центре вида. */
export const panTo = (p: Pt): Pt => ({ x: MAP_CENTER - p.x, y: MAP_CENTER - p.y })

/**
 * Экранное смещение курсора → смещение в плоскости карты. Плоскость наклонена на TILT вокруг X
 * (вертикаль сжата в cos), повёрнута на yaw и увеличена на zoom×fit; сдвиг применяется до масштаба.
 */
export function screenToPlaneDelta(dx: number, dy: number, yawDeg: number, scale: number): Pt {
  const ty = dy / Math.cos((TILT * Math.PI) / 180)
  const a = (-yawDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: (dx * c - ty * s) / scale, y: (dx * s + ty * c) / scale }
}
