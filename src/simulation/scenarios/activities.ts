import type { CharacterPose, EventKind, LocationId, ScenarioMode } from '../../types'

export interface Activity {
  kind: EventKind
  /** кандидаты якорных локаций (уличные). Для 'fixed' — сама локация сцены. */
  anchors: LocationId[]
  /** сцена, в которой идёт событие; 'anchor' = сцена самой уличной локации */
  scene: LocationId | 'anchor'
  dur: [number, number]
  pose: CharacterPose
  /** окно часов [от, до); до > 24 — переход через полночь */
  win: [number, number]
  weights: Record<ScenarioMode, number>
  outdoor: boolean
  captions: string[]
  props?: string[]
}

export const PARKS: LocationId[] = ['gorky-park', 'zaryadye', 'vdnh', 'neskuchny', 'patriarshy']
export const STREETS: LocationId[] = [
  'arbat',
  'kitay-gorod',
  'zamoskvorechye',
  'khamovniki',
  'tverskaya',
  'moscow-city',
]
export const ALL_OUTDOOR: LocationId[] = [...PARKS, ...STREETS]

const w = (
  random: number,
  free = random,
  work = random,
  rainy = random,
  winter = random,
  night = random,
): Record<ScenarioMode, number> => ({
  random,
  free,
  work,
  rainy,
  winter,
  night,
})

/** Таблица активностей: из неё DailyRoutineGenerator собирает бесконечные дни. */
export const ACTIVITIES: Activity[] = [
  {
    kind: 'wake',
    anchors: ['courtyard'],
    scene: 'home',
    dur: [12, 18],
    pose: 'sit',
    win: [5.5, 10.5],
    weights: w(3, 3, 6, 3, 3, 0),
    outdoor: false,
    captions: [
      'Просыпается дома — за окном начинается утро',
      'Утро в Москве: первый кофе у окна',
      'Потягивается и открывает окно во двор',
    ],
    props: ['coffee'],
  },
  {
    kind: 'bench',
    anchors: PARKS,
    scene: 'anchor',
    dur: [30, 52],
    pose: 'sit',
    win: [7, 22.5],
    weights: w(3, 4, 0.8, 0.5, 1.8, 0.6),
    outdoor: true,
    captions: [
      'Садится на лавочку в месте «{place}» и слушает город',
      'Наблюдает за прохожими: «{place}»',
      'Тихая минута на скамейке — {place}',
      'Достаёт наушники и смотрит на воду',
    ],
  },
  {
    kind: 'stroll',
    anchors: ALL_OUTDOOR,
    scene: 'anchor',
    dur: [26, 44],
    pose: 'walk',
    win: [0, 24],
    weights: w(2.4, 3.2, 1, 2.6, 2.6, 4),
    outdoor: true,
    captions: [
      'Неспешно гуляет: {place}',
      'Идёт по улице и разглядывает витрины — {place}',
      'Прогулка без цели. {place}',
    ],
  },
  {
    kind: 'cafe',
    anchors: ALL_OUTDOOR,
    scene: 'cafe',
    dur: [24, 40],
    pose: 'drink',
    win: [7, 26.5],
    weights: w(2.2, 2.4, 2.2, 4, 3.5, 2),
    outdoor: false,
    captions: [
      'Заходит в кофейню — {place}',
      'Заказывает капучино и ждёт у стойки',
      'Берёт кофе с собой и садится у окна',
    ],
    props: ['coffee'],
  },
  {
    kind: 'shop',
    anchors: ['arbat', 'khamovniki', 'kitay-gorod', 'zamoskvorechye'],
    scene: 'shop',
    dur: [14, 22],
    pose: 'stand',
    win: [10, 21],
    weights: w(1.2, 1.4, 0.6, 1.8, 1.4, 0.2),
    outdoor: false,
    captions: ['Заглядывает в небольшой книжный магазин', 'Выбирает открытку в тёплой лавке'],
  },
  {
    kind: 'work',
    anchors: ['moscow-city'],
    scene: 'office',
    dur: [45, 70],
    pose: 'type',
    win: [9, 18.5],
    weights: w(0.7, 0.3, 9, 0.2, 0.2, 0),
    outdoor: false,
    captions: ['Работает в офисе над проектом', 'Деловой ритм: письма, звонки, кофе', 'Окно офиса — вид на огни Сити'],
  },
  {
    kind: 'lunch',
    anchors: ['moscow-city'],
    scene: 'cafe',
    dur: [24, 34],
    pose: 'drink',
    win: [12, 14.5],
    weights: w(0.6, 0.2, 8, 0.2, 0.2, 0),
    outdoor: false,
    captions: ['Обеденный перерыв в кофейне рядом с офисом', 'Берёт ланч и немного отдыхает от экрана'],
    props: ['coffee'],
  },
  {
    kind: 'courtyard',
    anchors: ['courtyard'],
    scene: 'courtyard',
    dur: [20, 30],
    pose: 'sit',
    win: [8, 23],
    weights: w(1, 1.2, 1, 0.5, 0.8, 0.8),
    outdoor: true,
    captions: ['Присаживается в родном дворе', 'Голуби, качели и свет в окнах — двор Хамовников'],
  },
  {
    kind: 'evening-walk',
    anchors: ALL_OUTDOOR,
    scene: 'anchor',
    dur: [30, 46],
    pose: 'walk',
    win: [18, 28],
    weights: w(2.4, 3.4, 4, 2, 2.6, 3.5),
    outdoor: true,
    captions: [
      'Вечерняя прогулка по Москве: {place}',
      'Огни зажигаются — город после работы',
      'Время вечерней прогулки — {place}',
    ],
  },
  {
    kind: 'home-night',
    anchors: ['courtyard'],
    scene: 'home',
    dur: [22, 34],
    pose: 'read',
    win: [21, 26],
    weights: w(2.5, 2.5, 3, 3, 2.5, 0),
    outdoor: false,
    captions: ['Возвращается домой, включает лампу и читает', 'Тёплый вечер дома. За окном шумит город'],
  },
  {
    kind: 'sleep',
    anchors: ['courtyard'],
    scene: 'home',
    dur: [36, 52],
    pose: 'sleep',
    win: [23, 29.5],
    weights: w(9, 9, 9, 9, 9, 0),
    outdoor: false,
    captions: ['Засыпает под шум дождя и ночного города', 'Город засыпает вместе с персонажем'],
  },
]

export const inWindow = (hour: number, win: [number, number]): boolean => {
  const [a, b] = win
  return (hour >= a && hour < b) || (hour + 24 >= a && hour + 24 < b)
}

export const MODE_LABELS: Record<ScenarioMode, { label: string; blurb: string }> = {
  random: { label: 'Случайная жизнь', blurb: 'Город сам решает, как пройдёт день' },
  free: { label: 'Свободный день', blurb: 'Парки, кофейни и неспешные прогулки' },
  work: { label: 'Рабочий день', blurb: 'Метро, кофе, офис в Москва-Сити и домой' },
  rainy: { label: 'Дождливый день', blurb: 'Зонтик, лужи, тёплые кофейни' },
  winter: { label: 'Зимняя прогулка', blurb: 'Снег, пар от дыхания и огни гирлянд' },
  night: { label: 'Ночная Москва', blurb: 'Неон, пустые улицы и последний вагон' },
}
