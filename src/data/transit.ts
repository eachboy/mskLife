/**
 * Транспортная сеть MOSCOW LIFE.
 *
 * ВАЖНО: это локальный граф основных маршрутов для симуляции, а НЕ реальное расписание.
 * - Названия станций, линии, их порядок и пересадки соответствуют московскому метро (фрагмент сети
 *   вокруг используемых локаций). Координаты — приблизительные.
 * - Интервалы движения, время пересадок, глубина эскалаторов и время заказа такси — правдоподобные
 *   константы для игры, а не данные перевозчика.
 * - Наземные маршруты — условные коридоры по реальным улицам; кроме «Б» (Садовое кольцо),
 *   номера реальных маршрутов не используются.
 */
import type { LocationId, TravelMode } from '../types'

export interface MetroLineDef {
  id: string
  name: string
  color: string
  /** станции по порядку следования */
  stations: string[]
  ring?: boolean
}

export interface MetroStationDef {
  id: string
  line: string
  name: string
  lat: number
  lng: number
  /** время спуска/подъёма по эскалатору, мин (условно; глубокие станции дольше) */
  escalator: number
}

export interface TransferDef {
  a: string
  b: string
  /** пеший переход между платформами, мин (условно) */
  minutes: number
}

const st = (id: string, line: string, name: string, lat: number, lng: number, escalator = 2): MetroStationDef => ({
  id,
  line,
  name,
  lat,
  lng,
  escalator,
})

export const METRO_STATIONS: MetroStationDef[] = [
  // 1 Сокольническая
  st('1-lubyanka', '1', 'Лубянка', 55.7597, 37.6267),
  st('1-okhotny', '1', 'Охотный Ряд', 55.7577, 37.6156),
  st('1-biblioteka', '1', 'Библиотека имени Ленина', 55.7522, 37.61),
  st('1-kropotkinskaya', '1', 'Кропоткинская', 55.7454, 37.6043, 1),
  st('1-park-kultury', '1', 'Парк культуры', 55.7355, 37.5935),
  st('1-frunzenskaya', '1', 'Фрунзенская', 55.7276, 37.5802, 3),
  st('1-sportivnaya', '1', 'Спортивная', 55.7225, 37.5622, 1),
  // 2 Замоскворецкая
  st('2-belorusskaya', '2', 'Белорусская', 55.7774, 37.5822),
  st('2-mayakovskaya', '2', 'Маяковская', 55.7697, 37.5963, 3),
  st('2-tverskaya', '2', 'Тверская', 55.7651, 37.6044, 3),
  st('2-teatralnaya', '2', 'Театральная', 55.7588, 37.6189),
  st('2-novokuznetskaya', '2', 'Новокузнецкая', 55.7423, 37.6293, 3),
  st('2-paveletskaya', '2', 'Павелецкая', 55.7296, 37.6386),
  // 3 Арбатско-Покровская
  st('3-park-pobedy', '3', 'Парк Победы', 55.7363, 37.5163, 4),
  st('3-kievskaya', '3', 'Киевская', 55.7432, 37.5654, 3),
  st('3-smolenskaya', '3', 'Смоленская', 55.7477, 37.5838, 3),
  st('3-arbatskaya', '3', 'Арбатская', 55.7522, 37.6035, 3),
  st('3-pl-revolyutsii', '3', 'Площадь Революции', 55.7567, 37.6216, 2),
  st('3-kurskaya', '3', 'Курская', 55.7586, 37.6593, 3),
  // 4 Филёвская (мелкого заложения)
  st('4-aleksandrovsky', '4', 'Александровский сад', 55.7521, 37.6085, 1),
  st('4-arbatskaya', '4', 'Арбатская', 55.752, 37.6014, 1),
  st('4-smolenskaya', '4', 'Смоленская', 55.7491, 37.5823, 1),
  st('4-kievskaya', '4', 'Киевская', 55.7436, 37.5658, 1),
  // 4А ответвление Филёвской линии
  st('4a-kievskaya', '4A', 'Киевская', 55.7437, 37.566, 1),
  st('4a-vystavochnaya', '4A', 'Выставочная', 55.7502, 37.5426, 1),
  st('4a-mezhdunarodnaya', '4A', 'Международная', 55.7483, 37.5333, 1),
  // 5 Кольцевая
  st('5-park-kultury', '5', 'Парк культуры', 55.7353, 37.5946, 3),
  st('5-oktyabrskaya', '5', 'Октябрьская', 55.7293, 37.6111, 3),
  st('5-dobryninskaya', '5', 'Добрынинская', 55.729, 37.6225, 3),
  st('5-paveletskaya', '5', 'Павелецкая', 55.7314, 37.6366, 3),
  st('5-taganskaya', '5', 'Таганская', 55.7425, 37.6532, 3),
  st('5-kurskaya', '5', 'Курская', 55.7586, 37.6611, 3),
  st('5-komsomolskaya', '5', 'Комсомольская', 55.7754, 37.6545, 2),
  st('5-prospekt-mira', '5', 'Проспект Мира', 55.7796, 37.6334, 3),
  st('5-novoslobodskaya', '5', 'Новослободская', 55.7795, 37.6013, 3),
  st('5-belorusskaya', '5', 'Белорусская', 55.7752, 37.5822, 3),
  st('5-krasnopresnenskaya', '5', 'Краснопресненская', 55.7604, 37.5774, 3),
  st('5-kievskaya', '5', 'Киевская', 55.7444, 37.5672, 3),
  // 6 Калужско-Рижская
  st('6-vdnh', '6', 'ВДНХ', 55.8216, 37.6411, 3),
  st('6-alekseevskaya', '6', 'Алексеевская', 55.8078, 37.6388, 3),
  st('6-rizhskaya', '6', 'Рижская', 55.7925, 37.6363, 3),
  st('6-prospekt-mira', '6', 'Проспект Мира', 55.7808, 37.6334, 3),
  st('6-sukharevskaya', '6', 'Сухаревская', 55.7722, 37.6326, 3),
  st('6-turgenevskaya', '6', 'Тургеневская', 55.7654, 37.6371, 3),
  st('6-kitay-gorod', '6', 'Китай-город', 55.7564, 37.6311, 2),
  st('6-tretyakovskaya', '6', 'Третьяковская', 55.7406, 37.6262, 3),
  st('6-oktyabrskaya', '6', 'Октябрьская', 55.7289, 37.6123, 3),
  st('6-shabolovskaya', '6', 'Шаболовская', 55.7188, 37.6079, 3),
  // 7 Таганско-Краснопресненская
  st('7-barrikadnaya', '7', 'Баррикадная', 55.7608, 37.5814, 3),
  st('7-pushkinskaya', '7', 'Пушкинская', 55.7656, 37.604, 3),
  st('7-kuznetsky-most', '7', 'Кузнецкий Мост', 55.7616, 37.6245, 3),
  st('7-kitay-gorod', '7', 'Китай-город', 55.7557, 37.6316, 2),
  st('7-taganskaya', '7', 'Таганская', 55.7395, 37.6532, 3),
  // 8А Солнцевская (фрагмент)
  st('8a-delovoy', '8A', 'Деловой центр', 55.7491, 37.5395, 2),
  st('8a-park-pobedy', '8A', 'Парк Победы', 55.7361, 37.5146, 4),
  // 9 Серпуховско-Тимирязевская (фрагмент)
  st('9-chekhovskaya', '9', 'Чеховская', 55.7657, 37.6082, 3),
  st('9-borovitskaya', '9', 'Боровицкая', 55.7504, 37.6094, 3),
  st('9-polyanka', '9', 'Полянка', 55.7368, 37.6185, 3),
  st('9-serpukhovskaya', '9', 'Серпуховская', 55.7266, 37.6245, 3),
]

export const METRO_LINES: MetroLineDef[] = [
  {
    id: '1',
    name: 'Сокольническая',
    color: '#E42313',
    stations: [
      '1-lubyanka',
      '1-okhotny',
      '1-biblioteka',
      '1-kropotkinskaya',
      '1-park-kultury',
      '1-frunzenskaya',
      '1-sportivnaya',
    ],
  },
  {
    id: '2',
    name: 'Замоскворецкая',
    color: '#4BAF4F',
    stations: [
      '2-belorusskaya',
      '2-mayakovskaya',
      '2-tverskaya',
      '2-teatralnaya',
      '2-novokuznetskaya',
      '2-paveletskaya',
    ],
  },
  {
    id: '3',
    name: 'Арбатско-Покровская',
    color: '#0072BA',
    stations: ['3-park-pobedy', '3-kievskaya', '3-smolenskaya', '3-arbatskaya', '3-pl-revolyutsii', '3-kurskaya'],
  },
  {
    id: '4',
    name: 'Филёвская',
    color: '#1EBCEF',
    stations: ['4-aleksandrovsky', '4-arbatskaya', '4-smolenskaya', '4-kievskaya'],
  },
  {
    id: '4A',
    name: 'Филёвская (ответвление к Сити)',
    color: '#1EBCEF',
    stations: ['4a-kievskaya', '4a-vystavochnaya', '4a-mezhdunarodnaya'],
  },
  {
    id: '5',
    name: 'Кольцевая',
    color: '#915133',
    ring: true,
    stations: [
      '5-park-kultury',
      '5-oktyabrskaya',
      '5-dobryninskaya',
      '5-paveletskaya',
      '5-taganskaya',
      '5-kurskaya',
      '5-komsomolskaya',
      '5-prospekt-mira',
      '5-novoslobodskaya',
      '5-belorusskaya',
      '5-krasnopresnenskaya',
      '5-kievskaya',
    ],
  },
  {
    id: '6',
    name: 'Калужско-Рижская',
    color: '#F07E24',
    stations: [
      '6-vdnh',
      '6-alekseevskaya',
      '6-rizhskaya',
      '6-prospekt-mira',
      '6-sukharevskaya',
      '6-turgenevskaya',
      '6-kitay-gorod',
      '6-tretyakovskaya',
      '6-oktyabrskaya',
      '6-shabolovskaya',
    ],
  },
  {
    id: '7',
    name: 'Таганско-Краснопресненская',
    color: '#943E90',
    stations: ['7-barrikadnaya', '7-pushkinskaya', '7-kuznetsky-most', '7-kitay-gorod', '7-taganskaya'],
  },
  { id: '8A', name: 'Солнцевская', color: '#FFCD1C', stations: ['8a-delovoy', '8a-park-pobedy'] },
  {
    id: '9',
    name: 'Серпуховско-Тимирязевская',
    color: '#ADACAC',
    stations: ['9-chekhovskaya', '9-borovitskaya', '9-polyanka', '9-serpukhovskaya'],
  },
]

/** Пересадки (реальные пересадочные узлы; время перехода — условное). */
export const METRO_TRANSFERS: TransferDef[] = [
  { a: '1-okhotny', b: '2-teatralnaya', minutes: 3 },
  { a: '2-teatralnaya', b: '3-pl-revolyutsii', minutes: 3 },
  { a: '1-okhotny', b: '3-pl-revolyutsii', minutes: 4 },
  { a: '1-biblioteka', b: '3-arbatskaya', minutes: 3 },
  { a: '1-biblioteka', b: '4-aleksandrovsky', minutes: 3 },
  { a: '1-biblioteka', b: '9-borovitskaya', minutes: 4 },
  { a: '3-arbatskaya', b: '4-aleksandrovsky', minutes: 3 },
  { a: '3-arbatskaya', b: '9-borovitskaya', minutes: 4 },
  { a: '4-aleksandrovsky', b: '9-borovitskaya', minutes: 4 },
  { a: '1-park-kultury', b: '5-park-kultury', minutes: 3 },
  { a: '5-oktyabrskaya', b: '6-oktyabrskaya', minutes: 3 },
  { a: '3-kievskaya', b: '4-kievskaya', minutes: 3 },
  { a: '3-kievskaya', b: '5-kievskaya', minutes: 4 },
  { a: '4-kievskaya', b: '5-kievskaya', minutes: 4 },
  { a: '4-kievskaya', b: '4a-kievskaya', minutes: 2 },
  { a: '3-kievskaya', b: '4a-kievskaya', minutes: 3 },
  { a: '5-kievskaya', b: '4a-kievskaya', minutes: 4 },
  { a: '6-kitay-gorod', b: '7-kitay-gorod', minutes: 1 },
  { a: '6-tretyakovskaya', b: '2-novokuznetskaya', minutes: 3 },
  { a: '7-pushkinskaya', b: '2-tverskaya', minutes: 3 },
  { a: '7-pushkinskaya', b: '9-chekhovskaya', minutes: 3 },
  { a: '2-tverskaya', b: '9-chekhovskaya', minutes: 3 },
  { a: '5-prospekt-mira', b: '6-prospekt-mira', minutes: 3 },
  { a: '5-belorusskaya', b: '2-belorusskaya', minutes: 3 },
  { a: '5-kurskaya', b: '3-kurskaya', minutes: 3 },
  { a: '5-paveletskaya', b: '2-paveletskaya', minutes: 4 },
  { a: '5-taganskaya', b: '7-taganskaya', minutes: 3 },
  { a: '7-kuznetsky-most', b: '1-lubyanka', minutes: 3 },
  { a: '5-dobryninskaya', b: '9-serpukhovskaya', minutes: 3 },
  { a: '5-krasnopresnenskaya', b: '7-barrikadnaya', minutes: 3 },
  { a: '4a-vystavochnaya', b: '8a-delovoy', minutes: 4 },
  { a: '3-park-pobedy', b: '8a-park-pobedy', minutes: 2 },
]

// ───────── Наземный транспорт ─────────

export interface StopDef {
  id: string
  name: string
  lat: number
  lng: number
}

export const BUS_STOPS: StopDef[] = [
  { id: 'smolenskaya-pl', name: 'Смоленская площадь', lat: 55.7477, lng: 37.5838 },
  { id: 'zubovskaya', name: 'Зубовская площадь', lat: 55.7369, lng: 37.588 },
  { id: 'krymsky-val', name: 'Парк Горького', lat: 55.7312, lng: 37.6033 },
  { id: 'oktyabrskaya-pl', name: 'Октябрьская площадь', lat: 55.7302, lng: 37.6125 },
  { id: 'serpukhovskaya-pl', name: 'Серпуховская площадь', lat: 55.7268, lng: 37.6236 },
  { id: 'kudrinskaya', name: 'Площадь Восстания', lat: 55.759, lng: 37.583 },
  { id: 'triumfalnaya', name: 'Триумфальная площадь', lat: 55.7699, lng: 37.5955 },
  { id: 'sukharevskaya-pl', name: 'Сухаревская площадь', lat: 55.7718, lng: 37.632 },
  { id: 'pushkinskaya-pl', name: 'Пушкинская площадь', lat: 55.7652, lng: 37.6062 },
  { id: 'okhotny', name: 'Охотный Ряд', lat: 55.7572, lng: 37.616 },
  { id: 'kitay', name: 'Китай-город', lat: 55.755, lng: 37.633 },
  { id: 'zaryadye', name: 'Парк Зарядье', lat: 55.7502, lng: 37.627 },
  { id: 'pyatnitskaya', name: 'Пятницкая улица', lat: 55.7405, lng: 37.6275 },
  { id: 'city', name: 'Москва-Сити', lat: 55.7494, lng: 37.54 },
  { id: '1905', name: 'Улица 1905 года', lat: 55.765, lng: 37.562 },
  { id: 'nikitskie', name: 'Никитские ворота', lat: 55.7573, lng: 37.5975 },
  { id: 'kropotkinskaya', name: 'Кропоткинская', lat: 55.745, lng: 37.603 },
  { id: 'borovitskaya', name: 'Боровицкая площадь', lat: 55.7505, lng: 37.611 },
  { id: 'khamovniki', name: 'Комсомольский проспект', lat: 55.733, lng: 37.58 },
  { id: 'prospekt-mira', name: 'Проспект Мира', lat: 55.7796, lng: 37.6334 },
  { id: 'rizhskaya', name: 'Рижский вокзал', lat: 55.7925, lng: 37.6363 },
  { id: 'vdnh', name: 'ВДНХ', lat: 55.824, lng: 37.64 },
  { id: 'neskuchny', name: 'Нескучный сад', lat: 55.7195, lng: 37.603 },
]

export interface SurfaceRouteDef {
  id: string
  mode: Extract<TravelMode, 'bus' | 'tram'>
  /** короткое имя для подписи */
  name: string
  title: string
  color: string
  stops: string[]
  /** ночной маршрут (ходит, когда метро закрыто) */
  night?: boolean
}

const corridor = (id: string, name: string, title: string, color: string, stops: string[]): SurfaceRouteDef[] => [
  { id, mode: 'bus', name, title, color, stops },
  { id: `${id}-night`, mode: 'bus', name: `ночной ${name}`, title, color: '#3d4a8a', stops, night: true },
]

/** Условные коридоры автобусов по реальным улицам. Днём ходят 05:30–01:00, ночные — 01:00–05:30. */
export const SURFACE_ROUTES: SurfaceRouteDef[] = [
  ...corridor('sadovoe', 'Б', 'Садовое кольцо', '#d6452e', [
    'sukharevskaya-pl',
    'triumfalnaya',
    'kudrinskaya',
    'smolenskaya-pl',
    'zubovskaya',
    'krymsky-val',
    'oktyabrskaya-pl',
    'serpukhovskaya-pl',
  ]),
  ...corridor('center-south', '«Центр — Замоскворечье»', 'Тверская — Пятницкая', '#2e7bd6', [
    'pushkinskaya-pl',
    'okhotny',
    'kitay',
    'zaryadye',
    'pyatnitskaya',
  ]),
  ...corridor('presnya', '«Сити — Пушкинская»', 'Пресня', '#2e9f6b', [
    'city',
    '1905',
    'kudrinskaya',
    'nikitskie',
    'pushkinskaya-pl',
  ]),
  ...corridor('khamovniki', '«Хамовники — Охотный Ряд»', 'Пречистенка', '#a05ad0', [
    'khamovniki',
    'zubovskaya',
    'kropotkinskaya',
    'borovitskaya',
    'okhotny',
  ]),
  ...corridor('mira', '«Проспект Мира — ВДНХ»', 'проспект Мира', '#d68a2e', [
    'sukharevskaya-pl',
    'prospekt-mira',
    'rizhskaya',
    'vdnh',
  ]),
  {
    id: 'leninsky',
    mode: 'bus',
    name: '«Ленинский проспект»',
    title: 'Ленинский проспект',
    color: '#7a8a2e',
    stops: ['oktyabrskaya-pl', 'neskuchny'],
  },
]

// ───────── Места (уличные «якоря» сцен) ─────────

export interface PlaceDef {
  id: LocationId
  /** выход/вход места (ворота парка, угол улицы) */
  gate: { name: string; lat: number; lng: number }
  /** пешком от «сердца» места до выхода, мин */
  inner: number
}

/** Места, между которыми ходит персонаж. Координаты самих мест берутся из LOCATIONS. */
export const PLACES: PlaceDef[] = [
  { id: 'gorky-park', gate: { name: 'главный вход с Крымского Вала', lat: 55.7311, lng: 37.6037 }, inner: 6 },
  { id: 'zaryadye', gate: { name: 'вход с Варварки', lat: 55.751, lng: 37.627 }, inner: 4 },
  { id: 'vdnh', gate: { name: 'Главный вход ВДНХ', lat: 55.8255, lng: 37.6385 }, inner: 7 },
  { id: 'neskuchny', gate: { name: 'вход с Ленинского проспекта', lat: 55.7205, lng: 37.5995 }, inner: 5 },
  { id: 'arbat', gate: { name: 'начало Арбата', lat: 55.7495, lng: 37.597 }, inner: 3 },
  { id: 'kitay-gorod', gate: { name: 'Славянская площадь', lat: 55.7548, lng: 37.6325 }, inner: 2 },
  { id: 'zamoskvorechye', gate: { name: 'Пятницкая улица', lat: 55.7405, lng: 37.6273 }, inner: 3 },
  { id: 'patriarshy', gate: { name: 'Малая Бронная', lat: 55.7642, lng: 37.5945 }, inner: 2 },
  { id: 'khamovniki', gate: { name: 'Комсомольский проспект', lat: 55.7338, lng: 37.5795 }, inner: 2 },
  { id: 'tverskaya', gate: { name: 'Пушкинская площадь', lat: 55.7653, lng: 37.6055 }, inner: 2 },
  { id: 'moscow-city', gate: { name: 'Пресненская набережная', lat: 55.7497, lng: 37.541 }, inner: 3 },
  { id: 'courtyard', gate: { name: 'арка двора', lat: 55.7333, lng: 37.578 }, inner: 1 },
]

// ───────── Константы движения (правдоподобные, не реальные данные) ─────────

/** скорость пешком, км/ч, и коэффициент «извилистости» городских улиц */
export const WALK_KMH = 4.6
export const DETOUR = 1.3
/** максимальная пешая связь между узлами, км по прямой */
export const MAX_WALK_LINK_KM = 1.7
export const MAX_STOP_LINK_KM = 1.0
export const MAX_PLACE_WALK_KM = 2.2

/** средняя скорость поезда метро с учётом стоянок, км/ч, и мин. длительность перегона */
export const METRO_KMH = 40
export const METRO_MIN_HOP = 2
/** автобус: км/ч днём / ночью, стоянка на остановке, мин */
export const BUS_KMH_DAY = 17
export const BUS_KMH_NIGHT = 27
export const BUS_DWELL = 0.5
/** такси: км/ч днём / в пик / ночью */
export const TAXI_KMH_DAY = 24
export const TAXI_KMH_PEAK = 17
export const TAXI_KMH_NIGHT = 36

/** часы работы: метро и дневные автобусы 05:30–01:00, ночные 01:00–05:30 */
export const DAY_SERVICE = { from: 5.5, to: 25 }
export const NIGHT_SERVICE = { from: 1, to: 5.5 }

const isPeak = (h: number) => (h >= 7.5 && h < 10) || (h >= 17 && h < 20)

/** Интервал метро, мин (условно): пик ~1.5, день ~2.5, вечер ~4, поздно ~6. */
export function metroHeadway(minutes: number): number {
  const h = (((minutes / 60) % 24) + 24) % 24
  if (isPeak(h)) return 1.5
  if (h >= 6 && h < 22) return 2.5
  if (h >= 22 && h < 23.5) return 4
  return 6
}

/** Интервал автобуса, мин (условно). */
export function busHeadway(minutes: number, night = false): number {
  if (night) return 25
  const h = (((minutes / 60) % 24) + 24) % 24
  if (isPeak(h)) return 7
  if (h >= 6.5 && h < 21) return 10
  return 15
}

/** Ожидание такси после заказа, мин (условно). */
export function taxiWait(minutes: number): number {
  const h = (((minutes / 60) % 24) + 24) % 24
  if (isPeak(h)) return 9
  if (h >= 1 && h < 6) return 8
  return 6
}

export function taxiKmh(minutes: number): number {
  const h = (((minutes / 60) % 24) + 24) % 24
  if (isPeak(h)) return TAXI_KMH_PEAK
  if (h >= 23 || h < 6) return TAXI_KMH_NIGHT
  return TAXI_KMH_DAY
}
