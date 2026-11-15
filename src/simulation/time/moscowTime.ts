import { sunTimes } from '../../data/sun'
import type { ActivityLevel, DayPhase, WeatherKind } from '../../types'
import { clamp, smooth } from '../../utils/math'

export interface MoscowParts {
  year: number
  /** 1..12 */
  month: number
  day: number
  hours: number
  minutes: number
  seconds: number
  /** 0 — воскресенье … 6 — суббота */
  weekday: number
}

let fmt: Intl.DateTimeFormat | null | undefined

function formatter(): Intl.DateTimeFormat | null {
  if (fmt !== undefined) return fmt
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Moscow',
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    })
  } catch {
    fmt = null
  }
  return fmt
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Настенное время Москвы для момента `now` — не зависит от часового пояса машины.
 * Основной путь — Intl (база tz). Если Intl без tz-данных — откат на UTC+3 (в Москве нет перевода часов с 2014 г.).
 */
export function moscowParts(now: Date = new Date()): MoscowParts {
  const f = formatter()
  if (f) {
    const p: Record<string, string> = {}
    for (const part of f.formatToParts(now)) p[part.type] = part.value
    return {
      year: Number(p.year),
      month: Number(p.month),
      day: Number(p.day),
      hours: Number(p.hour) % 24,
      minutes: Number(p.minute),
      seconds: Number(p.second),
      weekday: Math.max(0, WEEKDAYS.indexOf(p.weekday)),
    }
  }
  const msk = new Date(now.getTime() + 3 * 3600000)
  return {
    year: msk.getUTCFullYear(),
    month: msk.getUTCMonth() + 1,
    day: msk.getUTCDate(),
    hours: msk.getUTCHours(),
    minutes: msk.getUTCMinutes(),
    seconds: msk.getUTCSeconds(),
    weekday: msk.getUTCDay(),
  }
}

/**
 * Текущее московское время: минуты от полуночи (дробные) и Date, у которого
 * локальные поля (getHours/getMonth…) равны московскому времени — для старого кода.
 */
export function moscowNow(now: Date = new Date()): { minutes: number; date: Date; parts: MoscowParts } {
  const p = moscowParts(now)
  const ms = now.getMilliseconds() / 1000
  return {
    minutes: p.hours * 60 + p.minutes + (p.seconds + ms) / 60,
    date: new Date(p.year, p.month - 1, p.day, p.hours, p.minutes, p.seconds),
    parts: p,
  }
}

/** Месяц 0..11 по московской дате. */
export function moscowMonth(now: Date = new Date()): number {
  return moscowParts(now).month - 1
}

const wrapHours = (minutes: number) => (((minutes / 60) % 24) + 24) % 24

/**
 * Фаза суток. Утро/ночь — по часам (ритм города), закат — по реальной длине дня месяца.
 * deep-night 01–05, morning 05–11, day 11–(закат−1ч), sunset (закат−1ч … закат+0.75ч), evening … 23, night 23–01.
 */
export function dayPhase(minutes: number, month = moscowMonth()): DayPhase {
  const h = wrapHours(minutes)
  const [, set] = sunTimes(month)
  const sunsetFrom = Math.max(11.5, set - 1)
  const eveningFrom = Math.min(22.75, set + 0.75)
  if (h >= 1 && h < 5) return 'deep-night'
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < sunsetFrom) return 'day'
  if (h >= sunsetFrom && h < eveningFrom) return 'sunset'
  if (h >= eveningFrom && h < 23) return 'evening'
  return 'night'
}

// Ключевые точки «жизни» города: [час, прохожие, трафик]. Будни; выходные сглаживают утренний пик.
const LIFE: readonly [number, number, number][] = [
  [0, 0.22, 0.3],
  [1, 0.13, 0.2],
  [3, 0.05, 0.1],
  [5, 0.08, 0.18],
  [6.5, 0.3, 0.55],
  [8.5, 0.82, 1],
  [10, 0.6, 0.75],
  [13, 0.75, 0.7],
  [17, 0.75, 0.82],
  [18.5, 0.95, 1],
  [20, 0.8, 0.75],
  [22, 0.5, 0.55],
  [24, 0.22, 0.3],
]

function sampleLife(h: number): [number, number] {
  for (let i = 0; i < LIFE.length - 1; i++) {
    const a = LIFE[i]
    const b = LIFE[i + 1]
    if (h >= a[0] && h <= b[0]) {
      const t = smooth((h - a[0]) / (b[0] - a[0]))
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
    }
  }
  return [LIFE[0][1], LIFE[0][2]]
}

/** Метро открыто для входа 05:30–01:00 (условно, без учёта отдельных станций). */
export const METRO_OPEN_HOUR = 5.5
export const METRO_CLOSE_HOUR = 25

/** Уровень обслуживания транспорта 0..1: метро днём, ночью только ночные автобусы/такси. */
function transitLevel(h: number): number {
  const hh = h < METRO_OPEN_HOUR - 1 ? h + 24 : h
  // плавно гаснет 00:30–01:00 и разгорается 05:30–06:00
  const closing = clamp((METRO_CLOSE_HOUR - hh) / 0.5)
  const opening = clamp((hh - METRO_OPEN_HOUR) / 0.5)
  const metro = smooth(Math.min(closing, opening))
  const peak = Math.max(clamp(1 - Math.abs(h - 8.5) / 1.8), clamp(1 - Math.abs(h - 18.5) / 1.8))
  // днём поезда чаще, поздно вечером и рано утром — реже (плавно)
  const dayService = smooth(clamp(h - 6)) * smooth(clamp(22.5 - h))
  const base = 0.55 + dayService * 0.25
  return Math.max(0.15, metro * Math.min(1, base + peak * 0.25))
}

const WEATHER_PEOPLE: Partial<Record<WeatherKind, number>> = {
  'light-rain': 0.75,
  'heavy-rain': 0.45,
  thunderstorm: 0.35,
  snow: 0.85,
  'heavy-snow': 0.6,
  fog: 0.9,
  windy: 0.9,
}

export interface ActivityOptions {
  weather?: WeatherKind
  /** выходной: мягче утренний пик, больше гуляющих днём */
  weekend?: boolean
  month?: number
}

/**
 * Плотность жизни города по игровым минутам (непрерывная функция) — для спавна прохожих/машин
 * в сценах и громкости городского шума в аудио.
 */
export function activityLevel(minutes: number, opts: ActivityOptions = {}): ActivityLevel {
  const h = wrapHours(minutes)
  let [people, traffic] = sampleLife(h)
  if (opts.weekend) {
    const morning = clamp(1 - Math.abs(h - 8.5) / 2.5)
    people = people * (1 - morning * 0.4) + clamp(1 - Math.abs(h - 15) / 5) * 0.15
    traffic *= 1 - morning * 0.35
  }
  const wf = opts.weather ? (WEATHER_PEOPLE[opts.weather] ?? 1) : 1
  const pedestrians = clamp(people * wf)
  const trafficOut = clamp(traffic * (wf < 1 ? 0.9 + wf * 0.1 : 1))
  const transit = clamp(transitLevel(h))
  return {
    pedestrians,
    traffic: trafficOut,
    transit,
    overall: clamp(pedestrians * 0.45 + trafficOut * 0.35 + transit * 0.2),
    phase: dayPhase(minutes, opts.month ?? moscowMonth()),
  }
}
