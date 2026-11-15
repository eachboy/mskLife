import { CITY_GRAPH, getNode, nodeArea, nodeScene, type CityGraph } from '../../data/cityGraph'
import { DAY_SERVICE } from '../../data/transit'
import type { ScenarioEvent, TravelState } from '../../types'
import { PHASES, canTransition } from './states'

const hourOf = (m: number) => (((m / 60) % 24) + 24) % 24
const within = (h: number, from: number, to: number) => (h >= from && h < to) || (h + 24 >= from && h + 24 < to)
const fmt = (m: number) => {
  const h = hourOf(m)
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`
}

/** Проверка времени работы транспорта по фактической шкале цепочки. */
export function timelineIssues(events: ScenarioEvent[], startMinutes: number, graph: CityGraph = CITY_GRAPH): string[] {
  const issues: string[] = []
  let t = startMinutes
  for (const e of events) {
    const h = hourOf(t)
    if (e.phase === 'metro-vestibule' && !within(h, DAY_SERVICE.from, DAY_SERVICE.to))
      issues.push(`вход в метро «${e.station}» в ${fmt(t)}, когда метро закрыто`)
    if (e.phase === 'metro-transfer' && !within(h, DAY_SERVICE.from, DAY_SERVICE.to + 0.5))
      issues.push(`пересадка в ${fmt(t)}, когда переходы закрыты`)
    if ((e.phase === 'metro-platform-wait' || e.phase === 'bus-stop-wait' || e.phase === 'taxi-wait') && e.line) {
      const board = graph.lines.get(e.line.id)?.board
      const end = t + e.duration
      if (board?.length && !board.some((w) => within(hourOf(end), w.from, w.to + 0.5)))
        issues.push(`посадка на «${e.line.name}» в ${fmt(end)} — вне часов работы`)
    }
    t += e.duration * (e.clockRate ?? 1)
  }
  return issues
}

export interface ValidateOptions {
  startState?: TravelState
  graph?: CityGraph
  /** максимум длительности одной поездки, мин */
  maxTripMinutes?: number
}

/**
 * Инварианты цепочки событий (пустой массив — всё в порядке):
 * непрерывность from/to, отсутствие телепортов, допустимые переходы состояний,
 * правдоподобные длительности фаз, согласованность сцены с узлом, часы работы транспорта.
 */
export function validateChain(events: ScenarioEvent[], startMinutes: number, opts: ValidateOptions = {}): string[] {
  const graph = opts.graph ?? CITY_GRAPH
  const issues: string[] = []
  let state: TravelState = opts.startState ?? 'IDLE'
  const trips = new Map<string, number>()
  events.forEach((e, i) => {
    const tag = `#${i} ${e.phase}/${e.kind}`
    if (!e.from || !e.to) issues.push(`${tag}: нет from/to`)
    if (!(e.duration > 0) || !Number.isFinite(e.duration)) issues.push(`${tag}: длительность ${e.duration}`)
    const def = e.phase ? PHASES[e.phase] : undefined
    if (!def) {
      issues.push(`${tag}: неизвестная фаза`)
      return
    }
    const [dmin, dmax] = def.duration
    if (e.duration < dmin - 1e-6 || e.duration > dmax + 1e-6)
      issues.push(`${tag}: длительность ${e.duration} вне [${dmin}, ${dmax}]`)
    if (!e.travelState) issues.push(`${tag}: нет travelState`)
    else {
      if (e.phase !== 'activity' && e.travelState !== def.state)
        issues.push(`${tag}: состояние ${e.travelState} ≠ ${def.state}`)
      if (!canTransition(state, e.travelState)) issues.push(`${tag}: переход ${state} → ${e.travelState} запрещён`)
      state = e.travelState
    }
    if (e.phase !== 'activity' && !def.poses.includes(e.pose)) issues.push(`${tag}: поза ${e.pose} не подходит`)

    const prev = events[i - 1]
    if (prev) {
      if (prev.to !== e.from) issues.push(`${tag}: разрыв цепочки ${prev.to} → ${e.from}`)
      if (prev.location !== e.location && prev.phase === 'activity' && e.phase === 'activity')
        issues.push(`${tag}: телепорт ${prev.location} → ${e.location}`)
    }
    if (e.from && e.to) {
      if (e.phase === 'activity') {
        if (e.from !== e.to) issues.push(`${tag}: занятие должно стоять на месте`)
        const scene = nodeScene(e.from, graph)
        if (scene !== e.location) issues.push(`${tag}: сцена ${e.location} не совпадает с узлом ${e.from}`)
      } else {
        const types = [getNode(e.from, graph)?.type, getNode(e.to, graph)?.type]
        const ok = (allowed: string[]) => types.every((x) => x && allowed.includes(x))
        switch (def.location) {
          case 'metro-station':
            if (!ok(['metro-entrance', 'metro-platform']))
              issues.push(`${tag}: фаза метро вне станции (${e.from} → ${e.to})`)
            break
          case 'metro-ride':
            if (!ok(['metro-platform'])) issues.push(`${tag}: поездка метро не между платформами`)
            break
          case 'bus-stop':
            if (!ok(['bus-stop'])) issues.push(`${tag}: фаза остановки не на остановке`)
            break
          case 'bus-ride':
            if (!ok(e.mode === 'taxi' ? ['gate'] : ['bus-stop'])) issues.push(`${tag}: поездка не между остановками`)
            break
          case 'area': {
            const areas = [nodeArea(e.from, graph), nodeArea(e.to, graph)]
            if (!areas.includes(e.location))
              issues.push(`${tag}: уличная сцена ${e.location} не у узлов ${areas.join('/')}`)
            break
          }
        }
      }
    }
    if (e.trip) trips.set(e.trip.id, (trips.get(e.trip.id) ?? 0) + e.duration)
  })
  const maxTrip = opts.maxTripMinutes ?? 150
  for (const [id, total] of trips)
    if (total > maxTrip) issues.push(`поездка ${id}: ${total.toFixed(1)} мин — слишком долго`)
  issues.push(...timelineIssues(events, startMinutes, graph))
  return issues
}
