import { CITY_GRAPH, placeFor, placeNode, type CityGraph, type NodeId } from '../../data/cityGraph'
import type { LocationId, ScenarioEvent, ScenarioMode, WeatherKind } from '../../types'
import { makeId, planTrip } from '../travel/planTrip'

export { makeId }
export type { TravelMode } from '../../types'

export interface PlanOptions {
  /** время отправления, игровые минуты (по умолчанию 12:00) */
  minutes?: number
  scenario?: ScenarioMode
  graph?: CityGraph
}

/**
 * Цепочка событий-фаз между двумя уличными местами по графу города (Dijkstra):
 * пешком → метро/автобус/такси → пешком. Персонаж никогда не телепортируется:
 * event[i].to === event[i+1].from, первая фаза начинается в place:from, последняя кончается в place:to.
 * Помещения (кафе, офис, дом) приводятся к своему уличному месту.
 */
export function planTravel(
  from: LocationId,
  to: LocationId,
  weather: WeatherKind,
  rng: () => number = Math.random,
  opts: PlanOptions = {},
): ScenarioEvent[] {
  const a = placeFor(from)
  const b = placeFor(to)
  if (a === b) return []
  return planTravelFromNode(placeNode(a), placeNode(b), weather, rng, opts)
}

/** То же, но от произвольного узла графа (например, с платформы, если маршрут сменили в пути). */
export function planTravelFromNode(
  from: NodeId,
  to: NodeId,
  weather: WeatherKind,
  rng: () => number = Math.random,
  opts: PlanOptions = {},
): ScenarioEvent[] {
  return planTrip(from, to, {
    minutes: opts.minutes ?? 12 * 60,
    weather,
    scenario: opts.scenario,
    rng,
    graph: opts.graph ?? CITY_GRAPH,
  })
}
