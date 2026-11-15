import type { Availability, CityEdge, CityGraph, NodeId } from '../../data/cityGraph'
import type { ScenarioMode, TravelMode, WeatherKind } from '../../types'

/** Шаг маршрута: (выход из транспорта) → (ожидание + посадка) → проход ребра. */
export interface RouteStep {
  edge: CityEdge
  /** абсолютные игровые минуты начала шага */
  start: number
  /** выход из предыдущего транспорта перед шагом, мин */
  alight: number
  /** ожидание до открытия (метро в 05:30), мин */
  preOpen: number
  /** ожидание транспорта, мин (доля интервала, детерминированно от seed); 0 — без посадки */
  wait: number
  /** подход/посадка/валидация, мин */
  board: number
  /** проход самого ребра, мин */
  minutes: number
}

export interface Route {
  from: NodeId
  to: NodeId
  departure: number
  steps: RouteStep[]
  /** длительность поездки, мин (сумма шагов) */
  minutes: number
  cost: number
  /** число пересадок (посадок сверх первой) */
  transfers: number
  /** виды перемещения по порядку, без повторов подряд */
  modes: TravelMode[]
}

export interface RouteOptions {
  /** время отправления, игровые минуты (можно > 1440) */
  minutes: number
  weather: WeatherKind
  scenario?: ScenarioMode
  /** случайный разброс предпочтений (детерминированный, если rng с seed) */
  rng?: () => number
  /** штраф за каждую пересадку, мин; по умолчанию 4 */
  transferPenalty?: number
  /** «нежелание» брать такси, мин; по умолчанию из сценария */
  taxiPenalty?: number
  /** запрещённые виды */
  forbid?: TravelMode[]
}

// ───────── веса ─────────

/** Насколько неприятно идти пешком в такую погоду (множитель стоимости). */
export function walkWeatherPenalty(w: WeatherKind): number {
  switch (w) {
    case 'light-rain':
      return 1.5
    case 'heavy-rain':
      return 2.3
    case 'thunderstorm':
      return 2.8
    case 'snow':
      return 1.35
    case 'heavy-snow':
      return 2
    case 'fog':
    case 'windy':
      return 1.15
    case 'overcast':
      return 1.05
    default:
      return 1
  }
}

/** Медленнее идём по снегу/ливню (множитель времени). */
export function walkSlowdown(w: WeatherKind): number {
  if (w === 'heavy-snow') return 1.15
  if (w === 'snow') return 1.07
  if (w === 'heavy-rain' || w === 'thunderstorm') return 1.05
  return 1
}

const BAD = new Set<WeatherKind>(['heavy-rain', 'thunderstorm', 'heavy-snow'])

interface Prefs {
  bias: Record<TravelMode, number>
  /** «нежелание» вызывать такси, мин */
  taxi: number
  /** «цена» такси за км, мин-эквивалент */
  taxiKm: number
}

const SCENARIO_PREFS: Record<ScenarioMode, Prefs> = {
  free: { bias: { walk: 0.9, metro: 1, bus: 0.95, tram: 0.95, taxi: 1 }, taxi: 24, taxiKm: 1.1 },
  work: { bias: { walk: 1.05, metro: 0.9, bus: 1.1, tram: 1.1, taxi: 1 }, taxi: 24, taxiKm: 1.2 },
  rainy: { bias: { walk: 1, metro: 1, bus: 1, tram: 1, taxi: 1 }, taxi: 26, taxiKm: 1.1 },
  winter: { bias: { walk: 1, metro: 0.95, bus: 1, tram: 1, taxi: 1 }, taxi: 26, taxiKm: 1.1 },
  night: { bias: { walk: 0.95, metro: 1, bus: 1, tram: 1, taxi: 1 }, taxi: 20, taxiKm: 0.9 },
  random: { bias: { walk: 1, metro: 1, bus: 1, tram: 1, taxi: 1 }, taxi: 20, taxiKm: 1 },
}

const MODES: TravelMode[] = ['walk', 'metro', 'bus', 'tram', 'taxi']

function prefsFor(opts: RouteOptions): Prefs {
  const base = SCENARIO_PREFS[opts.scenario ?? 'random']
  const bias = { ...base.bias }
  let taxi = opts.taxiPenalty ?? base.taxi
  if (opts.rng) {
    // фиксированное число вызовов rng → детерминизм
    for (const m of MODES) bias[m] *= 0.85 + opts.rng() * 0.3
    taxi *= 0.7 + opts.rng() * 0.6
  }
  let taxiKm = base.taxiKm
  if (BAD.has(opts.weather) && opts.taxiPenalty === undefined) {
    taxi *= 0.7
    taxiKm *= 0.7
  }
  return { bias, taxi, taxiKm }
}

// ───────── доступность ─────────

const hourOf = (minutes: number) => (((minutes / 60) % 24) + 24) % 24

function inWindow(h: number, w: Availability) {
  return (h >= w.from && h < w.to) || (h + 24 >= w.from && h + 24 < w.to)
}

export function isOpen(av: Availability[] | undefined, minutes: number): boolean {
  if (!av?.length) return true
  const h = hourOf(minutes)
  return av.some((w) => inWindow(h, w))
}

/** Через сколько минут откроется (0 — открыто; Infinity — не скоро). */
export function minutesUntilOpen(av: Availability[] | undefined, minutes: number, maxWait = 45): number {
  if (isOpen(av, minutes)) return 0
  for (let d = 1; d <= maxWait; d++) if (isOpen(av, minutes + d)) return d
  return Number.POSITIVE_INFINITY
}

/** Детерминированная доля интервала [0.25..1] для линии и минуты посадки. */
function waitFactor(seed: number | null, line: string, t: number): number {
  if (seed === null) return 1
  let h = (seed ^ Math.floor(t)) >>> 0
  for (let i = 0; i < line.length; i++) h = Math.imul(h ^ line.charCodeAt(i), 0x01000193) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995) >>> 0
  h ^= h >>> 15
  return 0.25 + ((h >>> 0) / 4294967296) * 0.75
}

// ───────── Dijkstra по состояниям (узел, текущая линия) ─────────

interface Label {
  key: string
  node: NodeId
  line: string | null
  cost: number
  time: number
  boardings: number
  prev: Label | null
  step: RouteStep | null
}

class Heap {
  private a: Label[] = []
  get size() {
    return this.a.length
  }
  push(x: Label) {
    const a = this.a
    a.push(x)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].cost <= a[i].cost) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop(): Label | undefined {
    const a = this.a
    if (!a.length) return undefined
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l].cost < a[m].cost) m = l
        if (r < a.length && a[r].cost < a[m].cost) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

/**
 * Поиск маршрута Dijkstra с весами: время, ожидание (интервал), пересадки, пешие участки,
 * погода (дождь/снег — штраф пешком), сценарий (предпочтения видов) и доступность по времени суток.
 * Время ребра считается от фактического момента прохода (зависящий от времени граф).
 */
export function findRoute(graph: CityGraph, from: NodeId, to: NodeId, opts: RouteOptions): Route | null {
  if (from === to) return { from, to, departure: opts.minutes, steps: [], minutes: 0, cost: 0, transfers: 0, modes: [] }
  const prefs = prefsFor(opts)
  const seed = opts.rng ? Math.floor(opts.rng() * 2147483647) : null
  const transferPenalty = opts.transferPenalty ?? 4
  const forbid = new Set(opts.forbid ?? [])
  const walkPen = walkWeatherPenalty(opts.weather)
  const slow = walkSlowdown(opts.weather)
  const outdoorWait = BAD.has(opts.weather) ? 1.3 : 1

  const best = new Map<string, number>()
  const heap = new Heap()
  const start: Label = {
    key: `${from}|`,
    node: from,
    line: null,
    cost: 0,
    time: opts.minutes,
    boardings: 0,
    prev: null,
    step: null,
  }
  heap.push(start)
  best.set(start.key, 0)

  while (heap.size) {
    const cur = heap.pop()!
    if (cur.cost > (best.get(cur.key) ?? Number.POSITIVE_INFINITY)) continue
    if (cur.node === to && cur.line === null) return toRoute(cur, from, to, opts.minutes)
    for (const e of graph.out.get(cur.node) ?? []) {
      if (forbid.has(e.mode)) continue
      const ride = e.kind === 'ride'
      const nextLine = ride ? (e.line ?? null) : null
      const boarding = ride && nextLine !== cur.line
      const prevInfo = cur.line ? graph.lines.get(cur.line) : undefined
      const alight = cur.line && nextLine !== cur.line ? (prevInfo?.alightOverhead ?? 0) : 0
      let t = cur.time + alight
      let preOpen = 0
      let wait = 0
      let board = 0
      let cost = cur.cost + alight
      if (boarding) {
        const info = nextLine ? graph.lines.get(nextLine) : undefined
        if (!info) continue
        preOpen = minutesUntilOpen(info.board, t)
        if (!Number.isFinite(preOpen)) continue
        const headway = info.headway(t + preOpen)
        wait = Math.round(headway * waitFactor(seed, info.id, t + preOpen) * 10) / 10
        board = info.boardOverhead
        const outdoor = info.mode !== 'metro'
        // в стоимость — ожидаемое ожидание (половина интервала), во время — конкретное
        cost += (preOpen + headway * 0.6) * (outdoor ? outdoorWait : 1) + board
        if (cur.boardings > 0) cost += transferPenalty
        if (info.mode === 'taxi') cost += prefs.taxi
        t += preOpen + wait + board
      }
      if (!isOpen(e.availability, t)) continue
      let minutes = e.timeAt ? e.timeAt(t) : e.minutes
      const outdoorWalk = e.mode === 'walk' && (e.kind === 'street' || e.kind === 'inner')
      if (outdoorWalk) minutes *= slow
      cost += minutes * prefs.bias[e.mode] * (outdoorWalk ? walkPen : 1)
      if (e.mode === 'taxi') cost += e.km * prefs.taxiKm
      // переход между линиями «стоит» дороже своего времени: толпа, лестницы — не ради выхода
      if (e.kind === 'transfer') cost += 3
      const next: Label = {
        key: `${e.to}|${nextLine ?? ''}`,
        node: e.to,
        line: nextLine,
        cost,
        time: t + minutes,
        boardings: cur.boardings + (boarding ? 1 : 0),
        prev: cur,
        step: { edge: e, start: cur.time, alight, preOpen, wait, board, minutes },
      }
      if (cost < (best.get(next.key) ?? Number.POSITIVE_INFINITY)) {
        best.set(next.key, cost)
        heap.push(next)
      }
    }
  }
  return null
}

function toRoute(end: Label, from: NodeId, to: NodeId, departure: number): Route {
  const steps: RouteStep[] = []
  for (let l: Label | null = end; l?.step; l = l.prev) steps.unshift(l.step)
  const modes: TravelMode[] = []
  for (const s of steps) {
    const m = s.edge.mode
    if (s.edge.kind !== 'street' && s.edge.kind !== 'inner' && s.edge.kind !== 'ride') continue
    if (modes[modes.length - 1] !== m) modes.push(m)
  }
  return {
    from,
    to,
    departure,
    steps,
    minutes: end.time - departure,
    cost: end.cost,
    transfers: Math.max(0, end.boardings - 1),
    modes,
  }
}
