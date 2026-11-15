// ───────── Общие типы MOSCOW LIFE ─────────

export type WeatherKind =
  | 'clear'
  | 'partly-cloudy'
  | 'overcast'
  | 'light-rain'
  | 'heavy-rain'
  | 'thunderstorm'
  | 'snow'
  | 'heavy-snow'
  | 'fog'
  | 'windy'

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

/** Непрерывные параметры погоды (0..1), плавно интерполируются. */
export interface WeatherParams {
  cloud: number
  rain: number
  snow: number
  fog: number
  wind: number
  storm: number
}

export type SceneKind = 'park' | 'street' | 'metro-station' | 'metro-ride' | 'cafe' | 'bus' | 'office' | 'courtyard' | 'home'

export type LocationId =
  | 'gorky-park'
  | 'zaryadye'
  | 'vdnh'
  | 'neskuchny'
  | 'arbat'
  | 'kitay-gorod'
  | 'zamoskvorechye'
  | 'patriarshy'
  | 'khamovniki'
  | 'tverskaya'
  | 'moscow-city'
  | 'metro-station'
  | 'metro-ride'
  | 'cafe'
  | 'shop'
  | 'bus-stop'
  | 'bus-ride'
  | 'courtyard'
  | 'office'
  | 'home'

/** Профиль звукового окружения локации (0..1). Используется CitySoundEngine. */
export interface AmbienceProfile {
  traffic: number // шум дороги, проезжающие машины
  crowd: number // голоса, шаги толпы
  birds: number // птицы (днём, в ясную погоду)
  water: number // фонтаны, пруды, река
  metro: number // гул тоннеля, стук колёс, объявления
  cafe: number // звон посуды, кофемашина, разговоры
  office: number // кондиционер, клавиатуры
  wind: number // базовый фоновый ветер
  indoor: number // 0..1 приглушение высоких частот (помещение)
}

export interface LocationDef {
  id: LocationId
  name: string
  short: string
  kind: SceneKind
  district: string
  /** приблизительные координаты (для расчёта времени в пути) */
  lat: number
  lng: number
  blurb: string
  /** палитра/тема сцены */
  theme: SceneTheme
  ambience: AmbienceProfile
  /** шансы появления: людей и транспорта (0..1) */
  pedestrians: number
  traffic: number
  /** где допустима погода (false = помещение) */
  outdoor: boolean
  /** какой станцией метро обслуживается */
  nearestMetro: string
  /** можно ли выбрать как точку на карте */
  selectable: boolean
}

export interface SceneTheme {
  landmark:
    | 'gorky'
    | 'zaryadye'
    | 'vdnh'
    | 'neskuchny'
    | 'arbat'
    | 'kitay'
    | 'zamoskvorechye'
    | 'patriarshy'
    | 'khamovniki'
    | 'tverskaya'
    | 'city'
    | 'courtyard'
    | 'none'
  /** тон зданий */
  wall: string[]
  accent: string
  groundTop: string
  groundBottom: string
}

export type CharacterPose =
  | 'sit'
  | 'walk'
  | 'stand'
  | 'phone'
  | 'drink'
  | 'type'
  | 'sleep'
  | 'wait'
  | 'read'

export type ScenarioMode = 'random' | 'free' | 'work' | 'rainy' | 'winter' | 'night'

export type EventKind =
  | 'wake'
  | 'bench'
  | 'stroll'
  | 'to-metro'
  | 'metro-down'
  | 'metro-ride'
  | 'metro-up'
  | 'cafe'
  | 'shop'
  | 'bus-wait'
  | 'bus-ride'
  | 'work'
  | 'lunch'
  | 'evening-walk'
  | 'courtyard'
  | 'home-night'
  | 'sleep'
  | 'bus-exit'
  | 'taxi-wait'
  | 'taxi-ride'
  | 'taxi-exit'

export interface ScenarioEvent extends ScenarioEventTravelFields {
  id: string
  kind: EventKind
  location: LocationId
  /** длительность в «игровых минутах» (1 мин = 1 реальная секунда в ускоренном режиме) */
  duration: number
  pose: CharacterPose
  /** то, что показывается как подпись */
  caption: string
  /** кого/что показывать дополнительно */
  props?: string[]
  /** куда персонаж идёт (для pose=walk) */
  destination?: LocationId
  /** уличная «привязка»: вид за окном/ориентир для помещений и транспорта */
  anchor: LocationId
  /** игровых минут в секунду (по умолчанию 1); сон «перематывает» ночь */
  clockRate?: number
}

export interface MusicTrackInfo {
  title: string
  key: string
  bpm: number
  mood: string
}

export type Mood = 'dawn' | 'day' | 'dusk' | 'night'

// ───────── World Travel Engine (добавлено; существующие типы не менять) ─────────

/** Вид перемещения по графу города. */
export type TravelMode = 'walk' | 'metro' | 'bus' | 'taxi' | 'tram'

/** Состояния Character Travel State Machine. */
export type TravelState =
  | 'IDLE'
  | 'WALKING'
  | 'WAITING'
  | 'ENTERING_BUILDING'
  | 'ENTERING_TRANSPORT'
  | 'RIDING_METRO'
  | 'RIDING_BUS'
  | 'RIDING_TAXI'
  | 'EXITING_TRANSPORT'
  | 'SITTING'
  | 'WORKING'
  | 'RESTING'
  | 'OBSERVING_ENVIRONMENT'

/** Подфаза события (что именно сейчас делает персонаж). 'activity' — основное занятие (не перемещение). */
export type TravelPhase =
  | 'activity'
  | 'walk-exit-place'
  | 'walk-street'
  | 'walk-crossing'
  | 'walk-window'
  | 'walk-arrive'
  | 'metro-approach'
  | 'building-enter'
  | 'building-exit'
  | 'metro-vestibule'
  | 'metro-turnstile'
  | 'metro-escalator-down'
  | 'metro-platform-wait'
  | 'metro-train-arrival'
  | 'metro-boarding'
  | 'metro-departure'
  | 'metro-ride'
  | 'metro-arriving'
  | 'metro-alighting'
  | 'metro-transfer'
  | 'metro-escalator-up'
  | 'metro-exit'
  | 'bus-stop-wait'
  | 'bus-arrival'
  | 'bus-boarding'
  | 'bus-validate'
  | 'bus-ride'
  | 'bus-traffic-light'
  | 'bus-alighting'
  | 'taxi-order'
  | 'taxi-wait'
  | 'taxi-arrival'
  | 'taxi-boarding'
  | 'taxi-ride'
  | 'taxi-alighting'

/** Звуковые подсказки фаз (eventBus 'travel-sound'). Аудио само решает, чем их озвучить. */
export type TravelSoundCue =
  | 'footsteps'
  | 'crosswalk-signal'
  | 'building-door'
  | 'turnstile'
  | 'escalator'
  | 'platform-ambience'
  | 'train-arrive'
  | 'doors-open'
  | 'doors-close'
  | 'train-depart'
  | 'tunnel'
  | 'station-announcement'
  | 'train-brake'
  | 'bus-arrive'
  | 'bus-doors'
  | 'validator-beep'
  | 'bus-engine'
  | 'bus-brake'
  | 'phone-tap'
  | 'car-arrive'
  | 'car-door'
  | 'car-engine'
  | 'page-turn'
  | 'keyboard'
  | 'cup'

/** Фаза суток (атмосфера). Зависит от времени и длины дня по месяцу. */
export type DayPhase = 'morning' | 'day' | 'sunset' | 'evening' | 'night' | 'deep-night'

/** Ссылка на линию/маршрут для подписи и сцены. */
export interface TransitLineRef {
  id: string
  /** «Сокольническая», «Б», «ночной Н1»… */
  name: string
  color: string
  mode: TravelMode
}

/** Принадлежность события поездке. */
export interface TripRef {
  id: string
  /** номер события внутри поездки (0..count-1) */
  index: number
  count: number
  from: LocationId
  to: LocationId
  /** виды транспорта поездки по порядку (без повторов подряд) */
  modes: TravelMode[]
}

/** Плотность жизни города 0..1 (для сцен и звука). */
export interface ActivityLevel {
  /** прохожие */
  pedestrians: number
  /** машины/автобусы на улицах */
  traffic: number
  /** частота метро/наземного транспорта (0 — метро закрыто, ночные автобусы ≈0.15) */
  transit: number
  /** общий уровень */
  overall: number
  phase: DayPhase
}

/** Дополнительные поля ScenarioEvent (все необязательны для совместимости). */
export interface ScenarioEventTravelFields {
  /** узел графа города, где событие начинается / заканчивается (для активностей from === to) */
  from?: string
  to?: string
  phase?: TravelPhase
  travelState?: TravelState
  mode?: TravelMode
  line?: TransitLineRef
  /** станция метро / остановка, где происходит фаза (или откуда едем) */
  station?: string
  /** станция/остановка назначения текущего участка */
  nextStation?: string
  trip?: TripRef
  /** звуковые подсказки фазы */
  sounds?: TravelSoundCue[]
  /** показывать ли подпись тостом (мелкие фазы — нет, но caption всё равно заполнен) */
  announce?: boolean
}
