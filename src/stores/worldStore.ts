import { create } from 'zustand'
import { moscowMonth, moscowNow } from '../simulation/time/moscowTime'
import type {
  CharacterPose,
  DayPhase,
  LocationId,
  ScenarioEvent,
  ScenarioMode,
  Season,
  TravelState,
  WeatherKind,
  WeatherParams,
} from '../types'

export type WeatherSource = 'simulation' | 'real'
export type ClockMode = 'accelerated' | 'real'

export interface WorldState {
  // ─ запуск
  started: boolean
  lowPerf: boolean
  // ─ время
  clockMode: ClockMode
  /** минуты от начала суток 0..1440 (дробные) */
  minutes: number
  dayCount: number
  season: Season
  // ─ погода
  weatherSource: WeatherSource
  weatherKind: WeatherKind
  /** текущие плавные параметры (обновляются WeatherTransitionManager ~5 Гц) */
  weather: WeatherParams
  temperature: number
  /** накопленный снег 0..1 и мокрый асфальт 0..1 */
  snowCover: number
  wetness: number
  // ─ место и персонаж
  location: LocationId
  /** локация-назначение во время перехода, иначе null */
  transitionTo: LocationId | null
  pose: CharacterPose
  event: ScenarioEvent | null
  eventElapsed: number
  eventKey: number
  scenarioMode: ScenarioMode
  /** узел графа города, где сейчас персонаж (event.to текущего события) */
  node: string | null
  /** состояние Character Travel State Machine */
  travelState: TravelState
  /** фаза суток по игровым минутам (обновляется при смене) */
  dayPhase: DayPhase
  paused: boolean
  /** лента подписей: что сейчас происходит */
  caption: string
  captionKey: number
  /** счётчик вспышек молний для визуала */
  lightningFlash: number

  patch: (p: Partial<WorldState>) => void
  setCaption: (c: string) => void
}

export const initialWeather: WeatherParams = { cloud: 0.15, rain: 0, snow: 0, fog: 0, wind: 0.15, storm: 0 }

function seasonFromDate(d = new Date()): Season {
  const m = moscowMonth(d)
  if (m === 11 || m <= 1) return 'winter'
  if (m <= 4) return 'spring'
  if (m <= 7) return 'summer'
  return 'autumn'
}

export const useWorldStore = create<WorldState>((set) => ({
  started: false,
  lowPerf: false,
  clockMode: 'accelerated',
  minutes: 8 * 60,
  dayCount: 0,
  season: seasonFromDate(),
  weatherSource: 'simulation',
  weatherKind: 'clear',
  weather: { ...initialWeather },
  temperature: 14,
  snowCover: 0,
  wetness: 0,
  location: 'gorky-park',
  transitionTo: null,
  pose: 'sit',
  event: null,
  eventElapsed: 0,
  eventKey: 0,
  scenarioMode: 'random',
  node: null,
  travelState: 'IDLE',
  dayPhase: 'morning',
  paused: false,
  caption: '',
  captionKey: 0,
  lightningFlash: 0,

  patch: (p) => set(p),
  setCaption: (caption) => set((s) => ({ caption, captionKey: s.captionKey + 1 })),
}))

/** Московское время (Europe/Moscow) независимо от часового пояса машины. */
export { moscowNow }
