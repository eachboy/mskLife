import { sunTimes } from '../../data/sun'
import { moscowMonth } from '../../simulation/time/moscowTime'
import type { Season, WeatherParams } from '../../types'
import { clamp, lerp, mixHex, smooth } from '../../utils/math'

export interface Lighting {
  skyTop: string
  skyMid: string
  skyBottom: string
  /** цвет и сила общего тонирующего слоя */
  tint: string
  tintAlpha: number
  /** 0 день … 1 глубокая ночь */
  night: number
  /** сколько тёплого света от закатного солнца 0..1 */
  golden: number
  /** фонари и окна светятся (0..1) */
  lamps: number
  /** положение солнца/луны по дуге: x 0..1, y 0..1 (0 вверху) */
  sun: { x: number; y: number; visible: boolean; opacity: number }
  moon: { x: number; y: number; visible: boolean }
  stars: number
  /** множитель яркости сцены */
  brightness: number
}

interface Key {
  h: number
  top: string
  mid: string
  bot: string
  tint: string
  a: number
}

// Ключевые кадры суток (час → палитра неба)
const KEYS: Key[] = [
  { h: 0, top: '#0d0b24', mid: '#1b1640', bot: '#2e2557', tint: '#14123a', a: 0.38 },
  { h: 4.5, top: '#14123a', mid: '#2b2257', bot: '#52396b', tint: '#2a2255', a: 0.3 },
  { h: 6, top: '#4a4a86', mid: '#c78aa6', bot: '#ffc08a', tint: '#ffb48a', a: 0.12 },
  { h: 8, top: '#8db8e2', mid: '#cfd4d8', bot: '#f8d9bb', tint: '#fff0d8', a: 0.04 },
  { h: 12, top: '#9ec3e6', mid: '#d2d2cf', bot: '#f6d3b5', tint: '#ffffff', a: 0 },
  { h: 16, top: '#9bbfe4', mid: '#d6cfc8', bot: '#f8d0ac', tint: '#ffe9c4', a: 0.04 },
  { h: 18.5, top: '#6b6fb0', mid: '#e9908f', bot: '#ffc27a', tint: '#ff9d6a', a: 0.14 },
  { h: 20, top: '#2f2a68', mid: '#7a4a85', bot: '#e58a7a', tint: '#7a4d8a', a: 0.2 },
  { h: 21.5, top: '#1a1646', mid: '#2e2557', bot: '#503a6e', tint: '#1d1a4a', a: 0.32 },
  { h: 24, top: '#0d0b24', mid: '#1b1640', bot: '#2e2557', tint: '#14123a', a: 0.38 },
]

function sample(hours: number) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i]
    const b = KEYS[i + 1]
    if (hours >= a.h && hours <= b.h) {
      const t = smooth((hours - a.h) / (b.h - a.h))
      return {
        top: mixHex(a.top, b.top, t),
        mid: mixHex(a.mid, b.mid, t),
        bot: mixHex(a.bot, b.bot, t),
        tint: mixHex(a.tint, b.tint, t),
        a: lerp(a.a, b.a, t),
      }
    }
  }
  const k = KEYS[0]
  return { top: k.top, mid: k.mid, bot: k.bot, tint: k.tint, a: k.a }
}

/** Типичный месяц сезона, если реальная дата не совпадает с сезоном. */
const SEASON_MONTH: Record<Season, number> = { winter: 0, spring: 3, summer: 6, autumn: 9 }
const MONTH_SEASON: Season[] = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']

/** Месяц для расчёта длины дня: текущий московский, если он в выбранном сезоне, иначе типичный для сезона. */
export function lightingMonth(season: Season, now = new Date()): number {
  const m = moscowMonth(now)
  return MONTH_SEASON[m] === season ? m : SEASON_MONTH[season]
}

/** Канонические часы палитры: восход 6:18, закат 19:36. Реальное время растягивается под длину дня. */
const C_RISE = 6.3
const C_SET = 19.6
export function canonicalHours(hours: number, rise: number, set: number): number {
  if (hours >= rise && hours <= set) return C_RISE + ((hours - rise) / (set - rise)) * (C_SET - C_RISE)
  const nightLen = 24 - (set - rise)
  const since = hours > set ? hours - set : hours + 24 - set
  const c = C_SET + (since / nightLen) * (24 - (C_SET - C_RISE))
  return c >= 24 ? c - 24 : c
}

/** Рассчитать освещение для времени суток с учётом погоды и сезона (длина дня по месяцу). */
export function getLighting(minutes: number, w: WeatherParams, season: Season, month = SEASON_MONTH[season]): Lighting {
  const hours = (((minutes % 1440) + 1440) % 1440) / 60
  const [rise, set] = sunTimes(month)
  const eff = canonicalHours(hours, rise, set)
  const s = sample(eff)

  // ночь: гладкая функция (сумерки ~1 канонический час до восхода и после заката)
  const dayness = smooth(clamp((eff - (C_RISE - 1.2)) / 2.2)) * smooth(clamp((C_SET + 1.6 - eff) / 2.2))
  const night = 1 - dayness

  // погода затемняет и обесцвечивает небо
  const gloom = clamp(w.cloud * 0.55 + w.rain * 0.35 + w.snow * 0.2 + w.fog * 0.2 + w.storm * 0.4)
  const grey = (c: string, amt: number, toward = '#7b8090') => mixHex(c, toward, amt)
  const nightGrey = night > 0.5 ? '#2b2b45' : '#8a8f9f'
  const skyTop = grey(s.top, gloom * 0.75, nightGrey)
  const skyMid = grey(s.mid, gloom * 0.7, nightGrey)
  const skyBottom = grey(s.bot, gloom * 0.55, nightGrey)

  const golden = clamp(1 - Math.abs(eff - 18.8) / 1.8) * (1 - gloom * 0.8) + clamp(1 - Math.abs(eff - 6.6) / 1.2) * (1 - gloom * 0.8) * 0.8

  // дуга солнца восход..закат (канон. 6..20), луны 19..7
  const sunT = (eff - C_RISE) / (C_SET - C_RISE)
  const moonT = eff >= 19 ? (eff - 19) / 12 : (eff + 5) / 12
  const lamps = clamp(smooth(clamp((night - 0.15) / 0.4)) + gloom * 0.35 * (1 - night) * 0.8)
  // солнце за тучами/осадками не видно
  const precip = clamp(Math.max(w.rain, w.snow, w.storm) * 1.6)
  const sunVis = (1 - w.cloud * 0.9) * (1 - precip)

  return {
    skyTop,
    skyMid,
    skyBottom,
    tint: s.tint,
    tintAlpha: clamp(s.a + gloom * 0.1),
    night,
    golden: clamp(golden),
    lamps,
    sun: { x: 0.08 + sunT * 0.84, y: 0.72 - Math.sin(clamp(sunT) * Math.PI) * 0.6, visible: sunT > -0.02 && sunT < 1.02, opacity: sunT > -0.02 && sunT < 1.02 ? clamp(sunVis * (1 - night * 1.2)) : 0 },
    moon: { x: 0.1 + clamp(moonT) * 0.8, y: 0.62 - Math.sin(clamp(moonT) * Math.PI) * 0.5, visible: night > 0.45 },
    stars: clamp((night - 0.45) * 2) * (1 - gloom),
    brightness: 1 - gloom * 0.18 - night * 0.12,
  }
}
