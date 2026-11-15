import { nextSimulatedWeather } from '../../features/weather/WeatherManager'
import type { EventKind, ScenarioEvent, ScenarioMode, Season, WeatherKind } from '../../types'
import { mulberry32 } from '../../utils/math'
import { DailyRoutineGenerator, START_MINUTES, anchorOfNode } from './DailyRoutineGenerator'

export interface SimulateOptions {
  mode: ScenarioMode
  days: number
  seed: number
  /** старт, игровые минуты (по умолчанию — как у сценария) */
  startMinutes?: number
  season?: Season
}

export interface SimulationRun {
  events: ScenarioEvent[]
  /** абсолютное время начала каждого события, игровые минуты */
  starts: number[]
  /** погода в момент начала каждого события */
  weather: WeatherKind[]
  startMinutes: number
  endMinutes: number
}

const MODE_SEASON: Record<ScenarioMode, Season> = {
  free: 'summer',
  work: 'autumn',
  rainy: 'autumn',
  winter: 'winter',
  night: 'summer',
  random: 'spring',
}

/**
 * Безголовый прогон генератора дня (как ScenarioEngine, но без таймеров и стора):
 * для тестов инвариантов и QA. Погода меняется по своему rng, чтобы не влиять на маршрут.
 */
export function simulateRoutine(o: SimulateOptions): SimulationRun {
  const rng = mulberry32(o.seed)
  const wrng = mulberry32(o.seed ^ 0x9e3779b9)
  const season = o.season ?? MODE_SEASON[o.mode]
  const gen = new DailyRoutineGenerator(rng)
  const start = o.startMinutes ?? START_MINUTES[o.mode]
  const end = start + o.days * 1440

  let weather: WeatherKind =
    o.mode === 'rainy' ? 'light-rain' : o.mode === 'winter' ? 'snow' : o.mode === 'night' ? 'partly-cloudy' : 'clear'
  let nextWeatherAt = start + 120
  const stepWeather = (t: number) => {
    while (t >= nextWeatherAt) {
      nextWeatherAt += 90 + wrng() * 150
      if (o.mode === 'rainy') weather = wrng() < 0.7 ? 'light-rain' : 'heavy-rain'
      else if (o.mode === 'winter') weather = wrng() < 0.75 ? 'snow' : 'heavy-snow'
      else if (o.mode === 'night') weather = wrng() < 0.6 ? 'partly-cloudy' : 'clear'
      else weather = nextSimulatedWeather(weather, season, wrng)
    }
  }

  const events: ScenarioEvent[] = []
  const starts: number[] = []
  const weathers: WeatherKind[] = []
  let t = start
  let lastKind: EventKind | null = null
  let streak = 0
  const take = (batch: ScenarioEvent[]) => {
    for (const e of batch) {
      events.push(e)
      starts.push(t)
      weathers.push(weather)
      if (e.phase === 'activity') {
        streak = e.kind === lastKind ? streak + 1 : 0
        lastKind = e.kind
      }
      t += e.duration * (e.clockRate ?? 1)
    }
  }

  take(gen.first(o.mode, start))
  while (t < end) {
    stepWeather(t)
    const node = events[events.length - 1].to!
    take(gen.next({ minutes: t, mode: o.mode, weather, anchor: anchorOfNode(node), node, lastKind, streak }))
  }
  return { events, starts, weather: weathers, startMinutes: start, endMinutes: t }
}
