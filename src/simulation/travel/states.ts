import type { CharacterPose, EventKind, LocationId, TravelPhase, TravelSoundCue, TravelState } from '../../types'

/** Описание состояния Character Travel State Machine. */
export interface TravelStateDef {
  /** позы, которыми сцены показывают состояние (первая — основная) */
  poses: CharacterPose[]
  /** подсказка аниматору/сцене: какой цикл анимации играть */
  animation: string
  /** типичная длительность, игровые минуты [мин, макс] */
  duration: [number, number]
  /** где и почему персонаж в этом состоянии */
  context: string
  /** допустимые следующие состояния */
  next: TravelState[]
  /** звуковые события при входе в состояние */
  sounds: TravelSoundCue[]
  /** условие входа (для документации и отладки) */
  enterWhen: string
}

const ACTIVITY_NEXT: TravelState[] = [
  'WALKING',
  'WAITING',
  'OBSERVING_ENVIRONMENT',
  'ENTERING_BUILDING',
  'SITTING',
  'IDLE',
]

export const TRAVEL_STATES: Record<TravelState, TravelStateDef> = {
  IDLE: {
    poses: ['stand', 'sit'],
    animation: 'idle-breath',
    duration: [3, 30],
    context: 'Начало сценария или пробуждение: персонаж ещё никуда не идёт',
    next: [...ACTIVITY_NEXT, 'WORKING', 'RESTING'],
    sounds: [],
    enterWhen: 'старт сценария; после сна',
  },
  WALKING: {
    poses: ['walk', 'stand'],
    animation: 'walk-cycle (stand — на эскалаторе)',
    duration: [0.5, 45],
    context: 'Тротуар, аллея парка, переход в метро, эскалатор',
    next: ['WALKING', 'WAITING', 'OBSERVING_ENVIRONMENT', 'ENTERING_BUILDING', 'SITTING', 'IDLE'],
    sounds: ['footsteps'],
    enterWhen: 'есть пеший участок маршрута или прогулка',
  },
  WAITING: {
    poses: ['wait', 'phone', 'stand'],
    animation: 'wait-shift-weight',
    duration: [0.2, 50],
    context: 'Светофор, платформа метро, остановка, ожидание такси',
    next: ['WAITING', 'ENTERING_TRANSPORT', 'WALKING', 'OBSERVING_ENVIRONMENT'],
    sounds: [],
    enterWhen: 'транспорт ещё не пришёл или горит красный',
  },
  ENTERING_BUILDING: {
    poses: ['walk'],
    animation: 'walk-to-door',
    duration: [0.5, 3],
    context: 'Дверь кофейни, офиса, подъезда, вестибюля метро',
    next: ['ENTERING_TRANSPORT', 'SITTING', 'WORKING', 'RESTING', 'OBSERVING_ENVIRONMENT', 'IDLE'],
    sounds: ['building-door'],
    enterWhen: 'персонаж дошёл до входа здания или станции',
  },
  ENTERING_TRANSPORT: {
    poses: ['walk', 'stand'],
    animation: 'step-through (турникет, двери вагона/автобуса/машины)',
    duration: [0.2, 2],
    context: 'Турникет, двери вагона, передняя дверь автобуса, дверь такси',
    next: ['WALKING', 'ENTERING_TRANSPORT', 'RIDING_METRO', 'RIDING_BUS', 'RIDING_TAXI'],
    sounds: [],
    enterWhen: 'транспорт прибыл и открыл двери / пройден вестибюль',
  },
  RIDING_METRO: {
    poses: ['sit', 'stand', 'phone', 'read'],
    animation: 'ride-sway (лёгкое покачивание вагона)',
    duration: [0.2, 60],
    context: 'Вагон метро: тоннель, огни, объявления станций',
    next: ['RIDING_METRO', 'EXITING_TRANSPORT'],
    sounds: ['tunnel'],
    enterWhen: 'двери вагона закрылись',
  },
  RIDING_BUS: {
    poses: ['sit', 'stand', 'phone'],
    animation: 'ride-sway (торможения у светофоров)',
    duration: [0.2, 60],
    context: 'Салон автобуса/трамвая: город за окном, светофоры',
    next: ['RIDING_BUS', 'EXITING_TRANSPORT'],
    sounds: ['bus-engine'],
    enterWhen: 'проезд оплачен, автобус тронулся',
  },
  RIDING_TAXI: {
    poses: ['sit'],
    animation: 'ride-still (фары встречных машин)',
    duration: [2, 70],
    context: 'Заднее сиденье такси',
    next: ['RIDING_TAXI', 'EXITING_TRANSPORT'],
    sounds: ['car-engine'],
    enterWhen: 'персонаж сел в машину',
  },
  EXITING_TRANSPORT: {
    poses: ['walk'],
    animation: 'step-out',
    duration: [0.2, 2],
    context: 'Выход из вагона, автобуса, такси',
    next: ['WALKING', 'WAITING', 'ENTERING_BUILDING', 'SITTING', 'OBSERVING_ENVIRONMENT', 'IDLE'],
    sounds: [],
    enterWhen: 'транспорт прибыл на нужную станцию/остановку',
  },
  SITTING: {
    poses: ['sit', 'drink', 'read', 'phone'],
    animation: 'sit-idle',
    duration: [5, 90],
    context: 'Скамейка, столик кофейни, двор',
    next: ACTIVITY_NEXT,
    sounds: [],
    enterWhen: 'персонаж пришёл на место отдыха',
  },
  WORKING: {
    poses: ['type'],
    animation: 'type-loop',
    duration: [20, 90],
    context: 'Рабочее место в офисе',
    next: ['WORKING', 'WALKING'],
    sounds: ['keyboard'],
    enterWhen: 'рабочее время и персонаж в офисе',
  },
  RESTING: {
    poses: ['read', 'sleep', 'sit'],
    animation: 'rest-breath (сон — замедленное дыхание)',
    duration: [10, 90],
    context: 'Дома: чтение, сон',
    next: ['RESTING', 'IDLE', 'WALKING'],
    sounds: [],
    enterWhen: 'вечер/ночь и персонаж дома',
  },
  OBSERVING_ENVIRONMENT: {
    poses: ['stand', 'walk', 'phone'],
    animation: 'look-around',
    duration: [1, 40],
    context: 'Витрина, книжная полка, вид на реку',
    next: ['WALKING', 'WAITING', 'ENTERING_BUILDING', 'SITTING', 'IDLE', 'OBSERVING_ENVIRONMENT'],
    sounds: [],
    enterWhen: 'что-то привлекло внимание по пути',
  },
}

export const canTransition = (from: TravelState, to: TravelState): boolean => TRAVEL_STATES[from].next.includes(to)

/** Минимальная машина состояний: хранит текущее состояние и проверяет переходы. */
export class TravelStateMachine {
  state: TravelState
  private log: TravelState[] = []

  constructor(initial: TravelState = 'IDLE') {
    this.state = initial
  }

  /** Переход. Возвращает false, если переход не разрешён (состояние всё равно меняется — мир не должен зависнуть). */
  transition(next: TravelState): boolean {
    const ok = canTransition(this.state, next)
    this.state = next
    this.log.push(next)
    if (this.log.length > 64) this.log.shift()
    return ok
  }

  reset(state: TravelState = 'IDLE') {
    this.state = state
    this.log = []
  }

  get history(): readonly TravelState[] {
    return this.log
  }
}

// ───────── фазы событий ─────────

/** Где показывать фазу: 'area' — уличная сцена вокруг узла; иначе конкретная сцена. */
export type PhaseLocation =
  | 'area'
  | 'activity'
  | Extract<LocationId, 'metro-station' | 'metro-ride' | 'bus-stop' | 'bus-ride'>

export interface PhaseDef {
  state: TravelState
  kind: EventKind
  location: PhaseLocation
  poses: CharacterPose[]
  /** правдоподобные границы длительности, игровые минуты */
  duration: [number, number]
  sounds: TravelSoundCue[]
  /** показывать подпись тостом */
  announce: boolean
}

const P = (
  state: TravelState,
  kind: EventKind,
  location: PhaseLocation,
  poses: CharacterPose[],
  duration: [number, number],
  sounds: TravelSoundCue[] = [],
  announce = false,
): PhaseDef => ({ state, kind, location, poses, duration, sounds, announce })

export const PHASES: Record<TravelPhase, PhaseDef> = {
  activity: P(
    'IDLE',
    'stroll',
    'activity',
    ['sit', 'walk', 'stand', 'phone', 'drink', 'type', 'sleep', 'wait', 'read'],
    [3, 120],
    [],
    true,
  ),
  'walk-exit-place': P('WALKING', 'stroll', 'area', ['walk'], [0.5, 12], ['footsteps'], true),
  'walk-street': P('WALKING', 'stroll', 'area', ['walk'], [0.5, 50], ['footsteps'], true),
  'walk-crossing': P('WAITING', 'stroll', 'area', ['wait'], [0.5, 3], ['crosswalk-signal']),
  'walk-window': P('OBSERVING_ENVIRONMENT', 'stroll', 'area', ['stand'], [1, 4]),
  'walk-arrive': P('WALKING', 'stroll', 'area', ['walk'], [0.5, 12], ['footsteps']),
  'metro-approach': P('WALKING', 'to-metro', 'area', ['walk'], [0.5, 40], ['footsteps'], true),
  'building-enter': P('ENTERING_BUILDING', 'stroll', 'area', ['walk'], [0.5, 3], ['building-door']),
  'building-exit': P('WALKING', 'stroll', 'area', ['walk'], [0.5, 3], ['building-door']),
  'metro-vestibule': P('ENTERING_BUILDING', 'metro-down', 'metro-station', ['walk'], [0.5, 2], ['building-door']),
  'metro-turnstile': P('ENTERING_TRANSPORT', 'metro-down', 'metro-station', ['walk'], [0.5, 2], ['turnstile']),
  'metro-escalator-down': P('WALKING', 'metro-down', 'metro-station', ['stand'], [0.5, 5], ['escalator'], true),
  'metro-platform-wait': P(
    'WAITING',
    'metro-down',
    'metro-station',
    ['wait', 'phone'],
    [0.2, 50],
    ['platform-ambience'],
    true,
  ),
  'metro-train-arrival': P(
    'WAITING',
    'metro-down',
    'metro-station',
    ['stand'],
    [0.2, 2],
    ['train-arrive', 'doors-open'],
  ),
  'metro-boarding': P('ENTERING_TRANSPORT', 'metro-down', 'metro-station', ['walk'], [0.2, 2]),
  'metro-departure': P(
    'RIDING_METRO',
    'metro-ride',
    'metro-ride',
    ['sit', 'stand'],
    [0.2, 1.5],
    ['doors-close', 'train-depart'],
  ),
  'metro-ride': P(
    'RIDING_METRO',
    'metro-ride',
    'metro-ride',
    ['sit', 'stand', 'phone', 'read'],
    [0.5, 60],
    ['tunnel'],
    true,
  ),
  'metro-arriving': P(
    'RIDING_METRO',
    'metro-ride',
    'metro-ride',
    ['stand', 'sit'],
    [0.2, 1.5],
    ['station-announcement', 'train-brake'],
  ),
  'metro-alighting': P('EXITING_TRANSPORT', 'metro-up', 'metro-station', ['walk'], [0.2, 2], ['doors-open']),
  'metro-transfer': P('WALKING', 'metro-down', 'metro-station', ['walk'], [0.5, 8], ['footsteps'], true),
  'metro-escalator-up': P('WALKING', 'metro-up', 'metro-station', ['stand'], [0.5, 5], ['escalator']),
  'metro-exit': P('WALKING', 'metro-up', 'metro-station', ['walk'], [0.5, 2], ['building-door']),
  'bus-stop-wait': P('WAITING', 'bus-wait', 'bus-stop', ['wait', 'phone'], [0.2, 50], [], true),
  'bus-arrival': P('WAITING', 'bus-wait', 'bus-stop', ['stand'], [0.2, 2], ['bus-arrive', 'bus-doors']),
  'bus-boarding': P('ENTERING_TRANSPORT', 'bus-wait', 'bus-stop', ['walk'], [0.2, 2]),
  'bus-validate': P('ENTERING_TRANSPORT', 'bus-ride', 'bus-ride', ['stand'], [0.2, 1.5], ['validator-beep']),
  'bus-ride': P('RIDING_BUS', 'bus-ride', 'bus-ride', ['sit', 'stand', 'phone'], [0.5, 60], ['bus-engine'], true),
  'bus-traffic-light': P('RIDING_BUS', 'bus-ride', 'bus-ride', ['sit', 'stand'], [0.2, 2], ['bus-brake']),
  'bus-alighting': P('EXITING_TRANSPORT', 'bus-exit', 'bus-stop', ['walk'], [0.2, 2], ['bus-doors']),
  'taxi-order': P('WAITING', 'taxi-wait', 'area', ['phone'], [0.3, 2], ['phone-tap'], true),
  'taxi-wait': P('WAITING', 'taxi-wait', 'area', ['wait', 'phone'], [0.2, 50]),
  'taxi-arrival': P('WAITING', 'taxi-wait', 'area', ['stand'], [0.3, 2], ['car-arrive']),
  'taxi-boarding': P('ENTERING_TRANSPORT', 'taxi-wait', 'area', ['walk'], [0.3, 2], ['car-door']),
  'taxi-ride': P('RIDING_TAXI', 'taxi-ride', 'bus-ride', ['sit'], [2, 80], ['car-engine'], true),
  'taxi-alighting': P('EXITING_TRANSPORT', 'taxi-exit', 'area', ['walk'], [0.3, 2], ['car-door']),
}

/** Состояние основного занятия по его виду. */
export const ACTIVITY_STATE: Partial<Record<EventKind, TravelState>> = {
  wake: 'IDLE',
  bench: 'SITTING',
  stroll: 'WALKING',
  'evening-walk': 'WALKING',
  cafe: 'SITTING',
  lunch: 'SITTING',
  shop: 'OBSERVING_ENVIRONMENT',
  work: 'WORKING',
  courtyard: 'SITTING',
  'home-night': 'RESTING',
  sleep: 'RESTING',
}

export const ACTIVITY_SOUNDS: Partial<Record<EventKind, TravelSoundCue[]>> = {
  cafe: ['cup'],
  lunch: ['cup'],
  work: ['keyboard'],
  'home-night': ['page-turn'],
  stroll: ['footsteps'],
  'evening-walk': ['footsteps'],
}
