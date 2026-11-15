// Мини-шина событий мира → аудио (молния→гром, шаги и т.д.)
import type { DayPhase, LocationId, TravelMode, TravelPhase, TravelSoundCue, TravelState } from '../types'

export interface WorldEvents {
  /** вспышка молнии; distance 0..1 (0 — рядом) определяет задержку/громкость грома */
  lightning: { distance: number }
  /** смена локации (для звуковых переходов) */
  'location-change': { from: string | null; to: string }
  /** персонаж сделал шаг (для скрипа снега и т.п.) */
  footstep: { surface: 'asphalt' | 'snow' | 'grass' | 'floor' }
  /** проехал транспорт */
  'vehicle-pass': { kind: 'car' | 'bus' | 'tram' | 'taxi' | 'metro' | 'bike' }
  /** персонаж сменил состояние/фазу (Character Travel State Machine) */
  'travel-state': {
    state: TravelState
    prev: TravelState
    phase: TravelPhase
    mode: TravelMode | null
    location: LocationId
    /** длительность фазы, игровые минуты */
    duration: number
  }
  /** звуковая подсказка фазы: турникет, двери, эскалатор, валидатор… */
  'travel-sound': { cue: TravelSoundCue; phase: TravelPhase; mode: TravelMode | null }
  /** смена фазы суток */
  'day-phase': { phase: DayPhase; prev: DayPhase | null }
}

type Handler<K extends keyof WorldEvents> = (payload: WorldEvents[K]) => void

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Partial<Record<keyof WorldEvents, Set<Handler<any>>>> = {}

export const eventBus = {
  on<K extends keyof WorldEvents>(type: K, fn: Handler<K>): () => void {
    const set = (handlers[type] ??= new Set()) as Set<Handler<K>>
    set.add(fn)
    return () => set.delete(fn)
  },
  emit<K extends keyof WorldEvents>(type: K, payload: WorldEvents[K]): void {
    const set = handlers[type] as Set<Handler<K>> | undefined
    set?.forEach((fn) => {
      try {
        fn(payload)
      } catch (e) {
        console.error('[eventBus]', type, e)
      }
    })
  },
}
