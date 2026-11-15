import { LOCATIONS } from '../../data/locations'
import { CITY_GRAPH, getNode, nodeArea, type CityGraph, type NodeId } from '../../data/cityGraph'
import type {
  CharacterPose,
  LocationId,
  ScenarioEvent,
  ScenarioMode,
  TransitLineRef,
  TravelMode,
  TravelPhase,
  WeatherKind,
} from '../../types'
import { pick } from '../../utils/math'
import { findRoute, type Route, type RouteStep } from './router'
import { PHASES } from './states'
import { timelineIssues } from './validateChain'

let uid = 0
export const makeId = (p: string) => `${p}-${++uid}`

export interface TripOptions {
  /** время отправления, игровые минуты */
  minutes: number
  weather: WeatherKind
  scenario?: ScenarioMode
  rng: () => number
  graph?: CityGraph
}

const r1 = (x: number) => Math.round(x * 100) / 100

interface Draft {
  phase: TravelPhase
  from: NodeId
  to: NodeId
  duration: number
  caption: string
  mode: TravelMode
  pose?: CharacterPose
  location?: LocationId
  anchor?: LocationId
  destination?: LocationId
  line?: TransitLineRef
  station?: string
  nextStation?: string
}

const isOutdoorWalk = (s: RouteStep) => s.edge.mode === 'walk' && (s.edge.kind === 'street' || s.edge.kind === 'inner')

/**
 * Превращает найденный маршрут в цепочку событий-фаз. Длительности фаз в сумме равны
 * длительности маршрута (плюс необязательные остановки у светофора/витрины, если `extras`).
 */
export function routeToEvents(route: Route, opts: TripOptions, extras: boolean): ScenarioEvent[] {
  const graph = opts.graph ?? CITY_GRAPH
  const rng = opts.rng
  const name = (id: NodeId) => getNode(id, graph)?.name ?? ''
  const nodeType = (id: NodeId) => getNode(id, graph)?.type
  const destPlace = nodeArea(route.to, graph)
  const destName = LOCATIONS[destPlace].name
  const lineRef = (id?: string): TransitLineRef | undefined => {
    const l = id ? graph.lines.get(id) : undefined
    return l ? { id: l.id, name: l.name, color: l.color, mode: l.mode } : undefined
  }
  const hour = (m: number) => (((m / 60) % 24) + 24) % 24
  const drafts: Draft[] = []
  const push = (d: Draft) => {
    if (d.duration > 0) drafts.push({ ...d, duration: r1(d.duration) })
  }
  let t = route.departure
  const steps = route.steps
  let i = 0

  while (i < steps.length) {
    const s = steps[i]
    const e = s.edge

    // выход из транспорта перед этим шагом
    if (s.alight > 0) {
      const prev = steps[i - 1]
      const mode = prev.edge.mode
      const at = e.from
      const phase: TravelPhase =
        mode === 'metro' ? 'metro-alighting' : mode === 'taxi' ? 'taxi-alighting' : 'bus-alighting'
      const caption =
        mode === 'metro'
          ? `Выходит из вагона на станции «${name(at)}»`
          : mode === 'taxi'
            ? `Выходит из такси: ${LOCATIONS[nodeArea(at, graph)].name}`
            : `Выходит на остановке «${name(at)}»`
      push({
        phase,
        from: at,
        to: at,
        duration: s.alight,
        caption,
        mode,
        line: lineRef(prev.edge.line),
        station: name(at),
      })
      t += s.alight
    }

    if (isOutdoorWalk(s)) {
      // необязательные остановки на улице: светофор, витрина — в начале пешего участка от выхода
      if (extras && e.kind === 'street' && nodeType(e.from) === 'gate') {
        const h = hour(t)
        const area = nodeArea(e.from, graph)
        if (rng() < (h >= 1 && h < 6 ? 0.1 : 0.35)) {
          const d = 0.8 + rng() * 1.2
          push({
            phase: 'walk-crossing',
            from: e.from,
            to: e.from,
            duration: d,
            mode: 'walk',
            caption: pick(CROSSING, rng),
          })
          t += r1(d)
        }
        if (LOCATIONS[area].kind === 'street' && h >= 10 && h < 21.5 && rng() < 0.22) {
          const d = 1.5 + rng() * 1.5
          push({
            phase: 'walk-window',
            from: e.from,
            to: e.from,
            duration: d,
            mode: 'walk',
            caption: pick(WINDOWS, rng),
          })
          t += r1(d)
        }
      }
      // соседние уличные шаги в одном районе — одним событием
      let minutes = s.minutes
      let to = e.to
      let j = i + 1
      if (e.kind === 'street') {
        while (
          j < steps.length &&
          steps[j].edge.kind === 'street' &&
          steps[j].alight === 0 &&
          nodeArea(steps[j].edge.from, graph) === nodeArea(e.from, graph)
        ) {
          minutes += steps[j].minutes
          to = steps[j].edge.to
          j++
        }
      }
      const toType = nodeType(to)
      const fromType = nodeType(e.from)
      let phase: TravelPhase = 'walk-street'
      let caption: string
      let destination: LocationId | undefined
      let location = nodeArea(e.from, graph)
      if (e.kind === 'inner' && fromType === 'place') {
        phase = 'walk-exit-place'
        caption = LOCATIONS[location].kind === 'park' ? `Идёт к выходу — ${name(to)}` : `Идёт в сторону: ${name(to)}`
      } else if (e.kind === 'inner') {
        phase = 'walk-arrive'
        location = nodeArea(to, graph)
        caption = `На месте: ${LOCATIONS[location].name}`
      } else if (toType === 'metro-entrance') {
        phase = 'metro-approach'
        destination = 'metro-station'
        caption = `Направляется к станции метро «${name(to)}»`
      } else if (toType === 'bus-stop') {
        destination = 'bus-stop'
        caption = `Идёт к остановке «${name(to)}»`
      } else {
        const target = nodeArea(to, graph)
        if (target !== location) destination = target
        caption = `Идёт пешком в сторону места «${LOCATIONS[target].name}»`
      }
      push({ phase, from: e.from, to, duration: minutes, caption, mode: 'walk', location, destination })
      t += minutes
      i = j
      continue
    }

    if (e.kind === 'access-in') {
      const st = name(e.from)
      push({
        phase: 'metro-vestibule',
        from: e.from,
        to: e.from,
        duration: 1,
        mode: 'metro',
        station: st,
        caption: `Заходит в вестибюль станции «${st}»`,
      })
      push({
        phase: 'metro-turnstile',
        from: e.from,
        to: e.from,
        duration: 1,
        mode: 'metro',
        station: st,
        caption: 'Прикладывает «Тройку» к турникету',
      })
      push({
        phase: 'metro-escalator-down',
        from: e.from,
        to: e.to,
        duration: s.minutes - 2,
        mode: 'metro',
        station: st,
        caption: `Спускается по эскалатору на станцию «${st}»`,
      })
      t += s.minutes
      i++
      continue
    }
    if (e.kind === 'access-out') {
      const st = name(e.from)
      push({
        phase: 'metro-escalator-up',
        from: e.from,
        to: e.to,
        duration: s.minutes - 1,
        mode: 'metro',
        station: st,
        caption: `Поднимается по эскалатору к выходу станции «${st}»`,
      })
      push({
        phase: 'metro-exit',
        from: e.to,
        to: e.to,
        duration: 1,
        mode: 'metro',
        station: st,
        caption: `Выходит из метро «${st}» в город`,
      })
      t += s.minutes
      i++
      continue
    }
    if (e.kind === 'transfer') {
      const a = getNode(e.from, graph)
      const b = getNode(e.to, graph)
      const l = lineRef(b?.line)
      push({
        phase: 'metro-transfer',
        from: e.from,
        to: e.to,
        duration: s.minutes,
        mode: 'metro',
        station: a?.name,
        nextStation: b?.name,
        line: l,
        caption:
          a?.name === b?.name
            ? `Пересадка на линию «${l?.name}»`
            : `Переход «${a?.name}» → «${b?.name}», линия «${l?.name}»`,
      })
      t += s.minutes
      i++
      continue
    }

    // поездка: посадка + все подряд шаги той же линии
    const line = e.line ?? ''
    const ref = lineRef(line)
    const mode = e.mode
    const at = e.from
    const stName = name(at)
    let j = i
    const ride: RouteStep[] = []
    while (
      j < steps.length &&
      steps[j].edge.kind === 'ride' &&
      steps[j].edge.line === line &&
      (j === i || steps[j].alight === 0)
    ) {
      ride.push(steps[j])
      j++
    }
    const end = ride[ride.length - 1].edge.to
    const endName = name(end)
    const total = ride.reduce((a, r) => a + r.minutes, 0)
    const wait = s.preOpen + s.wait
    const b = s.board
    if (mode === 'metro') {
      push({
        phase: 'metro-platform-wait',
        from: at,
        to: at,
        duration: wait,
        mode,
        line: ref,
        station: stName,
        caption:
          s.preOpen > 0
            ? `Ждёт первый поезд на станции «${stName}» — метро открывается в 5:30`
            : `Ждёт поезд на станции «${stName}», линия «${ref?.name}»`,
      })
      push({
        phase: 'metro-train-arrival',
        from: at,
        to: at,
        duration: b / 2,
        mode,
        line: ref,
        station: stName,
        caption: 'Из тоннеля приходит поезд — двери открываются',
      })
      push({
        phase: 'metro-boarding',
        from: at,
        to: at,
        duration: b / 2,
        mode,
        line: ref,
        station: stName,
        caption: 'Пассажиры выходят, персонаж заходит в вагон',
      })
      const d = Math.min(1, total / 4)
      const hops = ride.length
      push({
        phase: 'metro-departure',
        from: at,
        to: at,
        duration: d,
        mode,
        line: ref,
        station: stName,
        nextStation: endName,
        caption: '«Осторожно, двери закрываются» — поезд трогается',
      })
      push({
        phase: 'metro-ride',
        from: at,
        to: end,
        duration: total - 2 * d,
        mode,
        line: ref,
        station: stName,
        nextStation: endName,
        caption: `Едет в метро, линия «${ref?.name}»: «${stName}» → «${endName}» (${hops} ${plural(hops, 'перегон', 'перегона', 'перегонов')})`,
      })
      push({
        phase: 'metro-arriving',
        from: end,
        to: end,
        duration: d,
        mode,
        line: ref,
        station: endName,
        caption: `«Станция ${endName}» — поезд замедляется`,
      })
    } else if (mode === 'taxi') {
      const wAt = LOCATIONS[nodeArea(at, graph)].name
      push({
        phase: 'taxi-order',
        from: at,
        to: at,
        duration: b / 3,
        mode,
        line: ref,
        caption: `Заказывает такси в приложении — ${wAt}`,
      })
      push({
        phase: 'taxi-wait',
        from: at,
        to: at,
        duration: wait,
        mode,
        line: ref,
        caption: `Ждёт такси: машина будет через ${Math.max(1, Math.round(wait))} мин`,
      })
      push({
        phase: 'taxi-arrival',
        from: at,
        to: at,
        duration: b / 3,
        mode,
        line: ref,
        caption: 'Подъезжает такси — фары скользят по асфальту',
      })
      push({
        phase: 'taxi-boarding',
        from: at,
        to: at,
        duration: b / 3,
        mode,
        line: ref,
        caption: 'Садится на заднее сиденье',
      })
      const h = hour(t + b + wait)
      const when = h >= 22 || h < 6 ? 'ночному' : h >= 18 ? 'вечернему' : 'дневному'
      push({
        phase: 'taxi-ride',
        from: at,
        to: end,
        duration: total,
        mode,
        line: ref,
        caption: `Едет на такси по ${when} городу — до места «${LOCATIONS[nodeArea(end, graph)].name}»`,
      })
    } else {
      const vehicle = mode === 'tram' ? 'трамвай' : 'автобус'
      const vehicleIn = mode === 'tram' ? 'трамвае' : 'автобусе'
      push({
        phase: 'bus-stop-wait',
        from: at,
        to: at,
        duration: wait,
        mode,
        line: ref,
        station: stName,
        caption: `Ждёт ${vehicle} ${ref?.name ?? ''} на остановке «${stName}»`.replace('  ', ' '),
      })
      push({
        phase: 'bus-arrival',
        from: at,
        to: at,
        duration: b / 2,
        mode,
        line: ref,
        station: stName,
        caption: `Подходит ${vehicle} ${ref?.name ?? ''} — двери открываются`.replace('  ', ' '),
      })
      push({
        phase: 'bus-boarding',
        from: at,
        to: at,
        duration: b / 4,
        mode,
        line: ref,
        station: stName,
        caption: 'Заходит через переднюю дверь',
      })
      push({
        phase: 'bus-validate',
        from: at,
        to: at,
        duration: b / 4,
        mode,
        line: ref,
        station: stName,
        caption: 'Прикладывает карту к валидатору — короткий писк',
      })
      if (extras && ride.length >= 2 && rng() < 0.55) {
        const k = 1 + Math.floor(rng() * (ride.length - 1))
        const mid = ride[k - 1].edge.to
        const first = ride.slice(0, k).reduce((a, r) => a + r.minutes, 0)
        const rest = total - first
        const light = Math.min(1, rest / 3)
        push({
          phase: 'bus-ride',
          from: at,
          to: mid,
          duration: first,
          mode,
          line: ref,
          station: stName,
          nextStation: name(mid),
          caption: `Едет на ${vehicleIn} ${ref?.name ?? ''} — мимо проплывает город`.replace('  ', ' '),
        })
        push({
          phase: 'bus-traffic-light',
          from: mid,
          to: mid,
          duration: light,
          mode,
          line: ref,
          station: name(mid),
          caption: `Стоит на светофоре у остановки «${name(mid)}»`,
        })
        push({
          phase: 'bus-ride',
          from: mid,
          to: end,
          duration: rest - light,
          mode,
          line: ref,
          station: name(mid),
          nextStation: endName,
          caption: `Едет дальше — до остановки «${endName}»`,
        })
      } else {
        push({
          phase: 'bus-ride',
          from: at,
          to: end,
          duration: total,
          mode,
          line: ref,
          station: stName,
          nextStation: endName,
          caption: `Едет на ${vehicleIn} ${ref?.name ?? ''} до остановки «${endName}»`.replace('  ', ' '),
        })
      }
    }
    t += s.preOpen + s.wait + s.board + total
    i = j
  }

  // drafts → события
  const tripId = makeId('trip')
  const fromPlace = nodeArea(route.from, graph)
  return drafts.map((d, index) => {
    const def = PHASES[d.phase]
    const location: LocationId =
      d.location ?? (def.location === 'area' || def.location === 'activity' ? nodeArea(d.from, graph) : def.location)
    const anchor: LocationId =
      def.location === 'metro-ride' || def.location === 'bus-ride'
        ? nodeArea(d.to, graph)
        : (d.anchor ?? nodeArea(d.from, graph))
    const pose: CharacterPose = d.pose ?? (def.poses.length > 1 ? pick(def.poses, rng) : def.poses[0])
    return {
      id: makeId(def.kind),
      kind: def.kind,
      location,
      anchor,
      duration: d.duration,
      pose,
      caption: d.caption,
      destination: d.destination,
      from: d.from,
      to: d.to,
      phase: d.phase,
      travelState: def.state,
      mode: d.mode,
      line: d.line,
      station: d.station,
      nextStation: d.nextStation,
      trip: { id: tripId, index, count: drafts.length, from: fromPlace, to: destPlace, modes: route.modes },
      sounds: def.sounds,
      announce: def.announce || index === 0,
    } satisfies ScenarioEvent
  })
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

const CROSSING = [
  'Ждёт зелёный на переходе',
  'Останавливается у светофора — мимо проносятся машины',
  'Ждёт, пока загорится зелёный, и переходит улицу',
]
const WINDOWS = [
  'Задерживается у витрины книжного',
  'Рассматривает витрину с тёплым светом',
  'Заглядывает в окно пекарни',
]

/**
 * Поездка между двумя узлами графа: маршрут Dijkstra → фазы. Если необязательные
 * остановки сдвинули посадку за время работы транспорта — строится цепочка без них
 * (она совпадает с расписанием маршрута по построению).
 */
export function planTrip(from: NodeId, to: NodeId, opts: TripOptions): ScenarioEvent[] {
  if (from === to) return []
  const graph = opts.graph ?? CITY_GRAPH
  const route =
    findRoute(graph, from, to, {
      minutes: opts.minutes,
      weather: opts.weather,
      scenario: opts.scenario,
      rng: opts.rng,
    }) ?? findRoute(graph, from, to, { minutes: opts.minutes, weather: 'clear' })
  if (!route) throw new Error(`[planTrip] нет маршрута ${from} → ${to}`)
  const withExtras = routeToEvents(route, opts, true)
  if (!timelineIssues(withExtras, opts.minutes, graph).length) return withExtras
  return routeToEvents(route, opts, false)
}
