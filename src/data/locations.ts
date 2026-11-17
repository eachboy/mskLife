import type { AmbienceProfile, LocationDef, LocationId, SceneTheme } from '../types'

const amb = (p: Partial<AmbienceProfile>): AmbienceProfile => ({
  traffic: 0,
  crowd: 0,
  birds: 0,
  water: 0,
  metro: 0,
  cafe: 0,
  office: 0,
  wind: 0.2,
  indoor: 0,
  ...p,
})

const theme = (t: Partial<SceneTheme> & Pick<SceneTheme, 'landmark'>): SceneTheme => ({
  wall: ['#c9a58a', '#b98e7a', '#d9b99a', '#a7847a'],
  accent: '#ff9a62',
  groundTop: '#6d6a7c',
  groundBottom: '#4a475a',
  ...t,
})

/**
 * Каталог локаций. Чтобы добавить район — достаточно добавить запись сюда
 * (и, при желании, новые здания/ориентиры локации в `src/world3d`).
 */
export const LOCATIONS: Record<LocationId, LocationDef> = {
  'gorky-park': {
    id: 'gorky-park', name: 'Парк Горького', short: 'Горького', kind: 'park', district: 'Хамовники',
    lat: 55.7298, lng: 37.6017,
    blurb: 'Набережная, липы и лавочки у Москвы-реки',
    theme: theme({ landmark: 'gorky', groundTop: '#7d9a62', groundBottom: '#587a48', accent: '#ffb86b' }),
    ambience: amb({ birds: 0.8, crowd: 0.25, traffic: 0.2, water: 0.25, wind: 0.35 }),
    pedestrians: 0.8, traffic: 0.2, outdoor: true, nearestMetro: 'Парк культуры', selectable: true,
  },
  zaryadye: {
    id: 'zaryadye', name: 'Парк Зарядье', short: 'Зарядье', kind: 'park', district: 'Китай-город',
    lat: 55.7513, lng: 37.6286,
    blurb: 'Парящий мост, стеклянный купол и вид на Кремль',
    theme: theme({ landmark: 'zaryadye', groundTop: '#8aa57a', groundBottom: '#5f7d58', accent: '#ff8f6b' }),
    ambience: amb({ birds: 0.5, crowd: 0.35, traffic: 0.3, water: 0.35, wind: 0.4 }),
    pedestrians: 0.9, traffic: 0.25, outdoor: true, nearestMetro: 'Китай-город', selectable: true,
  },
  vdnh: {
    id: 'vdnh', name: 'ВДНХ', short: 'ВДНХ', kind: 'park', district: 'Останкинский',
    lat: 55.8265, lng: 37.6377,
    blurb: 'Золотые фонтаны и величественная арка',
    theme: theme({ landmark: 'vdnh', groundTop: '#9fb083', groundBottom: '#6a8756', accent: '#ffd36b', wall: ['#e8d9b8', '#dfc9a0', '#f1e4c8', '#cdb88c'] }),
    ambience: amb({ birds: 0.5, crowd: 0.5, traffic: 0.15, water: 0.7, wind: 0.3 }),
    pedestrians: 1, traffic: 0.1, outdoor: true, nearestMetro: 'ВДНХ', selectable: true,
  },
  neskuchny: {
    id: 'neskuchny', name: 'Нескучный сад', short: 'Нескучный', kind: 'park', district: 'Хамовники',
    lat: 55.7219, lng: 37.5917,
    blurb: 'Тихие аллеи, старые дубы и беседка над рекой',
    theme: theme({ landmark: 'neskuchny', groundTop: '#6f8f55', groundBottom: '#4c6c3c', accent: '#ffa860' }),
    ambience: amb({ birds: 1, crowd: 0.12, traffic: 0.08, water: 0.3, wind: 0.45 }),
    pedestrians: 0.35, traffic: 0, outdoor: true, nearestMetro: 'Октябрьская', selectable: true,
  },
  arbat: {
    id: 'arbat', name: 'Арбат', short: 'Арбат', kind: 'street', district: 'Арбат',
    lat: 55.7488, lng: 37.5927,
    blurb: 'Пешеходная улица, фонари и уличные музыканты',
    theme: theme({ landmark: 'arbat', wall: ['#e0b48e', '#cf9a7f', '#e9c9a0', '#b9877a', '#d8a47a'], accent: '#ffb35c', groundTop: '#8a7f86', groundBottom: '#665e6a' }),
    ambience: amb({ crowd: 0.8, traffic: 0.2, birds: 0.1, wind: 0.2 }),
    pedestrians: 1, traffic: 0.2, outdoor: true, nearestMetro: 'Арбатская', selectable: true,
  },
  'kitay-gorod': {
    id: 'kitay-gorod', name: 'Китай-город', short: 'Китай-город', kind: 'street', district: 'Китай-город',
    lat: 55.7544, lng: 37.6322,
    blurb: 'Старые переулки и белые стены Китайгородской стены',
    theme: theme({ landmark: 'kitay', wall: ['#eadfd0', '#d8c3a8', '#c79f86', '#e5cfb5'], accent: '#ff7a59' }),
    ambience: amb({ crowd: 0.55, traffic: 0.5, birds: 0.15, wind: 0.2 }),
    pedestrians: 0.8, traffic: 0.6, outdoor: true, nearestMetro: 'Китай-город', selectable: true,
  },
  zamoskvorechye: {
    id: 'zamoskvorechye', name: 'Замоскворечье', short: 'Замоскворечье', kind: 'street', district: 'Замоскворечье',
    lat: 55.7391, lng: 37.6277,
    blurb: 'Купеческие особняки и тихие кривые переулки',
    theme: theme({ landmark: 'zamoskvorechye', wall: ['#d6a88c', '#b9936f', '#c88e74', '#e1c29c', '#a5826b'], accent: '#ff9d5c' }),
    ambience: amb({ crowd: 0.2, traffic: 0.18, birds: 0.4, wind: 0.2 }),
    pedestrians: 0.45, traffic: 0.2, outdoor: true, nearestMetro: 'Третьяковская', selectable: true,
  },
  patriarshy: {
    id: 'patriarshy', name: 'Патриаршие пруды', short: 'Патрики', kind: 'park', district: 'Пресненский',
    lat: 55.7648, lng: 37.5933,
    blurb: 'Пруд, утки и дом, где жил Мастер',
    theme: theme({ landmark: 'patriarshy', groundTop: '#86a070', groundBottom: '#5d7b4e', accent: '#ffc27a', wall: ['#e2c7a5', '#d2a98a', '#c5967e', '#ead8b8'] }),
    ambience: amb({ crowd: 0.35, traffic: 0.2, birds: 0.7, water: 0.55, wind: 0.25 }),
    pedestrians: 0.6, traffic: 0.2, outdoor: true, nearestMetro: 'Маяковская', selectable: true,
  },
  khamovniki: {
    id: 'khamovniki', name: 'Хамовники', short: 'Хамовники', kind: 'street', district: 'Хамовники',
    lat: 55.7345, lng: 37.5789,
    blurb: 'Тихие улицы, кофейни и старые дворы',
    theme: theme({ landmark: 'khamovniki', wall: ['#d0b09a', '#bf8f80', '#e4cfae', '#a98a80'], accent: '#ff9078' }),
    ambience: amb({ crowd: 0.35, traffic: 0.35, birds: 0.4, wind: 0.2 }),
    pedestrians: 0.55, traffic: 0.4, outdoor: true, nearestMetro: 'Парк культуры', selectable: true,
  },
  tverskaya: {
    id: 'tverskaya', name: 'Тверская улица', short: 'Тверская', kind: 'street', district: 'Тверской',
    lat: 55.7648, lng: 37.6054,
    blurb: 'Главная улица города: витрины, трамваи не ходят, но такси — всегда',
    theme: theme({ landmark: 'tverskaya', wall: ['#cfa890', '#b98d7d', '#e3c3a3', '#9f8085', '#d9b394'], accent: '#ff8a5c', groundTop: '#7a7482', groundBottom: '#585363' }),
    ambience: amb({ crowd: 0.7, traffic: 0.95, birds: 0.05, wind: 0.2 }),
    pedestrians: 1, traffic: 1, outdoor: true, nearestMetro: 'Тверская', selectable: true,
  },
  'moscow-city': {
    id: 'moscow-city', name: 'Москва-Сити', short: 'Сити', kind: 'street', district: 'Пресненский',
    lat: 55.7494, lng: 37.5392,
    blurb: 'Стекло, сталь и огни небоскрёбов над набережной',
    theme: theme({ landmark: 'city', wall: ['#8ea2c4', '#7c8fb3', '#a9b8d6', '#6d7da3'], accent: '#7ee0ff', groundTop: '#6a6f86', groundBottom: '#4a4e66' }),
    ambience: amb({ crowd: 0.35, traffic: 0.55, birds: 0.1, water: 0.15, wind: 0.5 }),
    pedestrians: 0.6, traffic: 0.7, outdoor: true, nearestMetro: 'Деловой центр', selectable: true,
  },
  'metro-station': {
    id: 'metro-station', name: 'Станция метро', short: 'Метро', kind: 'metro-station', district: 'Метро',
    lat: 55.75, lng: 37.62,
    blurb: 'Мраморные своды, мозаики и ветер от прибывающего поезда',
    theme: theme({ landmark: 'none', accent: '#ffd38a', wall: ['#d8c8a8', '#c9b48e'] }),
    ambience: amb({ metro: 0.9, crowd: 0.55, wind: 0.05, indoor: 0.8 }),
    pedestrians: 0.9, traffic: 0, outdoor: false, nearestMetro: '', selectable: false,
  },
  'metro-ride': {
    id: 'metro-ride', name: 'Вагон метро', short: 'Вагон', kind: 'metro-ride', district: 'Метро',
    lat: 55.75, lng: 37.62,
    blurb: 'Перестук колёс и огни тоннеля за окном',
    theme: theme({ landmark: 'none', accent: '#ffd38a' }),
    ambience: amb({ metro: 1, crowd: 0.3, indoor: 0.9, wind: 0 }),
    pedestrians: 0.3, traffic: 0, outdoor: false, nearestMetro: '', selectable: false,
  },
  cafe: {
    id: 'cafe', name: 'Кофейня', short: 'Кофейня', kind: 'cafe', district: 'Хамовники',
    lat: 55.7351, lng: 37.58,
    blurb: 'Запах свежей обжарки и тихий джаз из колонок',
    theme: theme({ landmark: 'none', accent: '#ffb870' }),
    ambience: amb({ cafe: 1, crowd: 0.3, traffic: 0.08, indoor: 0.7, wind: 0 }),
    pedestrians: 0.4, traffic: 0, outdoor: false, nearestMetro: '', selectable: true,
  },
  shop: {
    id: 'shop', name: 'Маленький магазин', short: 'Магазин', kind: 'cafe', district: 'Арбат',
    lat: 55.7485, lng: 37.595,
    blurb: 'Книги, открытки и тёплый свет',
    theme: theme({ landmark: 'none', accent: '#ff9aa8' }),
    ambience: amb({ cafe: 0.35, crowd: 0.2, indoor: 0.75, wind: 0 }),
    pedestrians: 0.3, traffic: 0, outdoor: false, nearestMetro: '', selectable: false,
  },
  'bus-stop': {
    id: 'bus-stop', name: 'Остановка', short: 'Остановка', kind: 'street', district: 'Тверской',
    lat: 55.76, lng: 37.61,
    blurb: 'Ждём автобус под козырьком',
    theme: theme({ landmark: 'tverskaya', accent: '#ffb35c' }),
    ambience: amb({ traffic: 0.8, crowd: 0.3, wind: 0.25 }),
    pedestrians: 0.5, traffic: 0.9, outdoor: true, nearestMetro: '', selectable: false,
  },
  'bus-ride': {
    id: 'bus-ride', name: 'Автобус', short: 'Автобус', kind: 'bus', district: 'Город',
    lat: 55.76, lng: 37.61,
    blurb: 'Мимо проплывает вечерняя Москва',
    theme: theme({ landmark: 'none', accent: '#ffb35c' }),
    ambience: amb({ traffic: 0.7, crowd: 0.15, indoor: 0.6, wind: 0 }),
    pedestrians: 0.2, traffic: 0.9, outdoor: false, nearestMetro: '', selectable: false,
  },
  courtyard: {
    id: 'courtyard', name: 'Жилой двор', short: 'Двор', kind: 'courtyard', district: 'Хамовники',
    lat: 55.7336, lng: 37.5772,
    blurb: 'Качели, голуби и бельё на балконах',
    theme: theme({ landmark: 'courtyard', wall: ['#c9b3a0', '#b79f90', '#d7c3a8', '#a89588'], accent: '#ffa56b', groundTop: '#7b7468', groundBottom: '#5a5448' }),
    ambience: amb({ birds: 0.6, crowd: 0.1, traffic: 0.05, wind: 0.25 }),
    pedestrians: 0.35, traffic: 0.05, outdoor: true, nearestMetro: 'Парк культуры', selectable: true,
  },
  office: {
    id: 'office', name: 'Офис', short: 'Офис', kind: 'office', district: 'Пресненский',
    lat: 55.7494, lng: 37.5392,
    blurb: 'Открытое пространство с видом на Сити',
    theme: theme({ landmark: 'city', accent: '#7ee0ff' }),
    ambience: amb({ office: 1, crowd: 0.1, indoor: 0.85, wind: 0 }),
    pedestrians: 0.2, traffic: 0, outdoor: false, nearestMetro: '', selectable: true,
  },
  home: {
    id: 'home', name: 'Дом', short: 'Дом', kind: 'home', district: 'Хамовники',
    lat: 55.7336, lng: 37.5772,
    blurb: 'Тёплая комната и окно во двор',
    theme: theme({ landmark: 'none', accent: '#ffb070' }),
    ambience: amb({ crowd: 0, traffic: 0.1, birds: 0.1, indoor: 0.9, wind: 0.05 }),
    pedestrians: 0, traffic: 0, outdoor: false, nearestMetro: '', selectable: false,
  },
}

export const LOCATION_LIST = Object.values(LOCATIONS)
export const SELECTABLE_LOCATIONS = LOCATION_LIST.filter((l) => l.selectable)

/** Расстояние между локациями в км (гаверсинус). */
export function distanceKm(a: LocationId, b: LocationId): number {
  const A = LOCATIONS[a]
  const B = LOCATIONS[b]
  const R = 6371
  const dLat = ((B.lat - A.lat) * Math.PI) / 180
  const dLng = ((B.lng - A.lng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((A.lat * Math.PI) / 180) * Math.cos((B.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
