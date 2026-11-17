import { describe, expect, it } from 'vitest'
import { sunTimes } from '../../data/sun'
import { getLighting } from '../../features/city/lighting'
import { WEATHER_PRESETS } from '../../features/weather/weatherData'
import {
  DAY_FOG_K,
  fogDensityFor,
  gradeSky,
  VIS_FOG_M,
  VIS_PRECIP_M,
  visibilityDensityCap,
  FOG_BASE,
  hazeFactor,
  hexToLinear,
  lightingUniforms,
  makeLightingUniforms,
  moonDirection,
  sunDirection,
  weatherFactors,
} from './worldLight'

const clear = WEATHER_PRESETS.clear.params
const DEG = 180 / Math.PI
const alt = (m: number, month: number) => Math.asin(sunDirection(m, month).y) * DEG
/** Азимут от севера по часовой, градусы: +X восток, −Z север. */
const azimuth = (m: number, month: number) => {
  const v = sunDirection(m, month)
  return (Math.atan2(v.x, -v.z) * DEG + 360) % 360
}

describe('sunDirection', () => {
  it('единичный вектор, конечен при всех минутах и месяцах', () => {
    for (let month = 0; month < 12; month++) {
      for (let m = 0; m <= 1440; m += 5) {
        const v = sunDirection(m, month)
        const n = Math.hypot(v.x, v.y, v.z)
        expect(Number.isFinite(n)).toBe(true)
        expect(n).toBeCloseTo(1, 6)
        const mo = moonDirection(m, month)
        expect(Math.hypot(mo.x, mo.y, mo.z)).toBeCloseTo(1, 6)
      }
    }
  })

  it('восход и закат — высота около нуля, между ними выше, ночью ниже горизонта', () => {
    for (let month = 0; month < 12; month++) {
      const [rise, set] = sunTimes(month)
      expect(Math.abs(alt(rise * 60, month))).toBeLessThan(0.5)
      expect(Math.abs(alt(set * 60, month))).toBeLessThan(0.5)
      expect(alt(((rise + set) / 2) * 60, month)).toBeGreaterThan(5)
      expect(alt(0, month)).toBeLessThan(0)
    }
  })

  it('полдень (середина дня) — максимум высоты', () => {
    for (const month of [0, 5, 9]) {
      const [rise, set] = sunTimes(month)
      const noon = ((rise + set) / 2) * 60
      const top = alt(noon, month)
      for (let m = Math.ceil(rise * 60); m <= set * 60; m += 10) expect(alt(m, month)).toBeLessThanOrEqual(top + 1e-9)
    }
  })

  it('в июне максимум выше, чем в декабре', () => {
    const peak = (month: number) => {
      const [rise, set] = sunTimes(month)
      return alt(((rise + set) / 2) * 60, month)
    }
    expect(peak(5)).toBeGreaterThan(peak(11) + 30)
  })

  it('азимут растёт с востока на запад; в полдень солнце на юге (+Z)', () => {
    for (const month of [0, 5]) {
      const [rise, set] = sunTimes(month)
      let prev = -1
      for (let m = Math.ceil(rise * 60); m <= set * 60; m += 10) {
        const az = azimuth(m, month)
        expect(az).toBeGreaterThan(prev)
        prev = az
      }
      const mid = ((rise + set) / 2) * 60
      expect(azimuth(mid, month)).toBeCloseTo(180, 0)
      expect(sunDirection(mid, month).z).toBeGreaterThan(0)
      expect(sunDirection(rise * 60 + 30, month).x).toBeGreaterThan(0)
      expect(sunDirection(set * 60 - 30, month).x).toBeLessThan(0)
    }
  })

  it('восход летом на северо-востоке, зимой на юго-востоке', () => {
    expect(azimuth(sunTimes(5)[0] * 60, 5)).toBeLessThan(90)
    expect(azimuth(sunTimes(11)[0] * 60, 11)).toBeGreaterThan(90)
  })
})

describe('lightingUniforms', () => {
  const finite = (v: number) => Number.isFinite(v)
  const rgbOk = (c: { r: number; g: number; b: number }) =>
    finite(c.r) && finite(c.g) && finite(c.b) && c.r >= 0 && c.g >= 0 && c.b >= 0

  it('все значения конечны и неотрицательны при всех минутах и месяцах', () => {
    const u = makeLightingUniforms()
    for (let month = 0; month < 12; month++) {
      for (let m = 0; m <= 1440; m += 10) {
        lightingUniforms(getLighting(m, clear, 'summer', month), u)
        for (const c of [u.skyTop, u.skyMid, u.horizon, u.sunColor, u.hemiSky, u.hemiGround])
          expect(rgbOk(c)).toBe(true)
        for (const n of [u.sunIntensity, u.moonIntensity, u.hemiIntensity, u.night, u.golden, u.lamps, u.stars]) {
          expect(finite(n)).toBe(true)
          expect(n).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('монотонно темнеет от дня к ночи', () => {
    const base = getLighting(12 * 60, clear, 'summer', 5)
    let prevSun = Infinity
    let prevHemi = Infinity
    for (let i = 0; i <= 10; i++) {
      const u = lightingUniforms({ ...base, night: i / 10 })
      expect(u.sunIntensity).toBeLessThanOrEqual(prevSun)
      expect(u.hemiIntensity).toBeLessThanOrEqual(prevHemi)
      prevSun = u.sunIntensity
      prevHemi = u.hemiIntensity
    }
    const day = lightingUniforms(getLighting(12 * 60, clear, 'summer', 5))
    const night = lightingUniforms(getLighting(0, clear, 'summer', 5))
    expect(day.sunIntensity).toBeGreaterThan(night.sunIntensity)
    expect(day.hemiIntensity).toBeGreaterThan(night.hemiIntensity)
    expect(night.moonIntensity).toBeGreaterThan(day.moonIntensity)
    const lum = (c: { r: number; g: number; b: number }) => c.r + c.g + c.b
    expect(lum(day.skyTop)).toBeGreaterThan(lum(night.skyTop))
  })

  it('золотой час теплее полудня (красный/синий растёт)', () => {
    const noon = lightingUniforms(getLighting(12 * 60, clear, 'summer', 5))
    const [, set] = sunTimes(5)
    const gold = lightingUniforms(getLighting((set - 1) * 60, clear, 'summer', 5))
    expect(gold.sunColor.r / gold.sunColor.b).toBeGreaterThan(noon.sunColor.r / noon.sunColor.b)
  })
})

describe('weatherFactors и hexToLinear', () => {
  it('ливень и туман режут прямой свет и сгущают туман', () => {
    const o = { overcast: 0, direct: 1, fogDensity: 0 }
    weatherFactors(clear, o)
    const clearDirect = o.direct
    const clearFog = o.fogDensity
    weatherFactors(WEATHER_PRESETS['heavy-rain'].params, o)
    expect(o.direct).toBeLessThan(clearDirect)
    expect(o.fogDensity).toBeGreaterThan(clearFog)
    weatherFactors(WEATHER_PRESETS.fog.params, o)
    expect(o.fogDensity).toBeGreaterThan(clearFog * 2)
  })

  it('hex → линейный sRGB', () => {
    const c = { r: 0, g: 0, b: 0 }
    hexToLinear('#ffffff', c)
    expect(c.r).toBeCloseTo(1, 6)
    hexToLinear('#808080', c)
    expect(c.g).toBeCloseTo(0.2158, 3)
    hexToLinear('#000000', c, 2)
    expect(c.b).toBe(0)
  })
})

describe('дневная дымка и небо', () => {
  const lum = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

  it('ясный день редеет до DAY_FOG_K, ночь и облачность — полная база', () => {
    expect(hazeFactor(0, 0, 0)).toBeCloseTo(DAY_FOG_K, 9)
    expect(hazeFactor(1, 0, 0)).toBe(1)
    expect(hazeFactor(0, 0, 1)).toBe(1)
    expect(hazeFactor(0, 1, 0)).toBeGreaterThan(DAY_FOG_K)
  })

  it('плотность тумана: днём ясно < ночью, не отрицательна, туман-погода плотнее', () => {
    const o = { overcast: 0, direct: 1, fogDensity: 0 }
    weatherFactors(clear, o)
    const day = fogDensityFor(o.fogDensity, 0, 0, o.overcast)
    const night = fogDensityFor(o.fogDensity, 1, 0, o.overcast)
    expect(day).toBeLessThan(night)
    expect(day).toBeGreaterThan(0)
    expect(day).toBeCloseTo(o.fogDensity - FOG_BASE * (1 - hazeFactor(0, 0, o.overcast)), 9)
    weatherFactors(WEATHER_PRESETS.fog.params, o)
    expect(fogDensityFor(o.fogDensity, 0, 0, o.overcast)).toBeGreaterThan(day * 3)
    expect(fogDensityFor(0, 0, 0, 0)).toBe(0)
  })

  it('на дальности 600 м ясным днём дымка закрывает не более 10 % (дальние дома видны)', () => {
    const o = { overcast: 0, direct: 1, fogDensity: 0 }
    weatherFactors(clear, o)
    const d = fogDensityFor(o.fogDensity, 0, 0, o.overcast)
    expect(1 - Math.exp(-((d * 600) ** 2))).toBeLessThan(0.1)
  })

  it('полдень: горизонт неба не ярче 1.0 по яркости (нет белёсого молока), и холоднее (b ≥ r)', () => {
    const u = lightingUniforms(getLighting(12 * 60, clear, 'summer', 5))
    expect(lum(u.horizon)).toBeLessThan(1)
    expect(u.horizon.b).toBeGreaterThanOrEqual(u.horizon.r)
  })
})

describe('видимость и палитра по погоде (задание S4)', () => {
  const visibleM = (d: number) => 1.73 / d
  const lum = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  it('дождь и снег — видимость ≥ 800 м, туман — ≥ 400 м при любой плотности из weatherFactors', () => {
    const o = { overcast: 0, direct: 1, fogDensity: 0 }
    for (const [kind, min] of [
      ['heavy-rain', VIS_PRECIP_M],
      ['light-rain', VIS_PRECIP_M],
      ['thunderstorm', VIS_PRECIP_M],
      ['snow', VIS_PRECIP_M],
      ['heavy-snow', VIS_PRECIP_M],
      ['fog', VIS_FOG_M],
    ] as const) {
      const p = WEATHER_PRESETS[kind].params
      weatherFactors(p, o)
      const d = Math.min(fogDensityFor(o.fogDensity, 0, 0, o.overcast), visibilityDensityCap(p.fog))
      expect(visibleM(d), kind).toBeGreaterThanOrEqual(min - 1)
    }
  })
  it('пасмурный день: зенит темнее горизонта минимум на 25 % (3 плана, не молоко)', () => {
    const t = { r: 0.3, g: 0.34, b: 0.42 }
    const m = { r: 0.3, g: 0.34, b: 0.42 }
    const h = { r: 0.3, g: 0.34, b: 0.42 }
    gradeSky(t, m, h, 0.95, 0, 0)
    expect(lum(t)).toBeLessThan(lum(h) * 0.75)
    expect(lum(t)).toBeLessThan(lum(m))
  })
  it('ночью погода палитру неба не меняет; туман днём — розовее (r ≥ g)', () => {
    const a = { r: 0.1, g: 0.1, b: 0.2 }
    gradeSky(a, { ...a }, { ...a }, 1, 0.9, 1)
    expect(a).toEqual({ r: 0.1, g: 0.1, b: 0.2 })
    const t = { r: 0.3, g: 0.34, b: 0.42 }
    const h = { r: 0.3, g: 0.34, b: 0.42 }
    gradeSky(t, { ...t }, h, 0.8, 0.9, 0)
    expect(h.r).toBeGreaterThan(h.g)
    expect(h.b).toBeGreaterThan(h.g)
  })
})
