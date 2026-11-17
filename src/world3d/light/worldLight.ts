/**
 * Единственный мост «мир → рендер» (Plan §3, §5, инвариант 4). Без three и без React.
 *
 * Тик раз в 250 мс читает `getLighting()` и `useWorldStore.getState()`, считает направление солнца и луны
 * (дуга по `sunTimes`) и пишет ЦЕЛИ в `target`. Каждый кадр `stepWorldLight(dt)` плавно (`damp`) двигает
 * `worldLight` к цели; компоненты только читают `worldLight` в `useFrame` и копируют числа в объекты three.
 * Скрытая вкладка: интервал остановлен (`onPageVisibility`), после возврата — немедленный тик.
 *
 * Все цвета здесь — ЛИНЕЙНЫЙ sRGB (рабочее пространство three); hex из `getLighting()` переводятся один раз за тик.
 */
import { getLighting, type Lighting, lightingMonth } from '../../features/city/lighting'
import { sunTimes } from '../../data/sun'
import { useWorldStore } from '../../stores/worldStore'
import type { WeatherParams } from '../../types'
import { clamp, dampAlpha, lerp, smooth } from '../../utils/math'
import { isPageHidden, onPageVisibility } from '../../utils/pageVisibility'
import { LAT0 } from '../geo'

// ───────── Константы ─────────
/** Plan §3: тик моста — раз в 250 мс. */
export const TICK_MS = 250
/** Не из Плана: частота сглаживания значений, 1/с (отклик ≈ 0.5 с, без скачка при перемотке). */
const SMOOTH_LAMBDA = 2.5
/** Не из Плана: прирост яркости неба для HDR-буфера (после AgX небо иначе выходит тусклым). Применяется к небу и туману одинаково. */
const SKY_GAIN = 1.25
/** Не из Плана: днём (не ночь и не золотой час) яркость неба ниже, иначе после AgX небо и дымка сливаются в белёсое молоко. */
export const SKY_GAIN_DAY = 0.85
/** Не из Плана: днём горизонт/туман смешиваются с цветом зенита (холоднее): дальние дома светлее и холоднее, а не тёплое молоко. */
export const DAY_HORIZON_COOL = 0.4
/** Не из Плана: днём середина неба (видимая при взгляде на горизонт) ближе к зениту: серая палитра SVG даёт белёсое небо. */
export const DAY_MID_COOL = 0.55
/** Не из Плана: интенсивности света (калибровка по кадрам lookdev v2). */
const SUN_I = 7
const MOON_I = 0.9
const HEMI_DAY_I = 2
const HEMI_NIGHT_I = 0.7
/** Не из Плана: насыщенность палитры неба (палитра SVG серая после AgX). */
const SKY_SATURATION = 1.7
/** Не из Плана: высота луны, ночная глубина солнца и доля «ночи» для расчёта дуг. */
const MOON_MAX_ALT = (40 * Math.PI) / 180
const SUN_NIGHT_DEPTH = (15 * Math.PI) / 180
/** Не из Плана: сезонный месяц обновляем раз в минуту (lightingMonth создаёт Date). */
const MONTH_REFRESH_TICKS = (60_000 / TICK_MS) | 0

const DEG = Math.PI / 180
const LAT_RAD = LAT0 * DEG
const TAU = Math.PI * 2

// ───────── Типы ─────────
export interface Vec3 {
  x: number
  y: number
  z: number
}
export interface Rgb {
  r: number
  g: number
  b: number
}

/** Свет и небо, которые зависят только от `Lighting` (без погоды и без положения солнца). */
export interface LightingUniforms {
  skyTop: Rgb
  skyMid: Rgb
  /** Цвет у горизонта = цвет тумана (воздушная перспектива сходится с небом). */
  horizon: Rgb
  sunColor: Rgb
  hemiSky: Rgb
  hemiGround: Rgb
  /** Ясное небо: интенсивность прямого света солнца и луны. */
  sunIntensity: number
  moonIntensity: number
  hemiIntensity: number
  night: number
  golden: number
  lamps: number
  stars: number
}

/** Влияние погоды. */
export interface WeatherFactors {
  /** 0 ясно … 1 глухая облачность/осадки */
  overcast: number
  /** Доля прямого света, которая доходит до земли (облака и осадки её режут). */
  direct: number
  fogDensity: number
}

export interface WorldLightState {
  /** Направление на солнце / на луну (единичные, мировые оси). */
  sunDir: Vec3
  moonDir: Vec3
  /** Направление на главный источник (солнце или луна) для DirectionalLight. */
  keyDir: Vec3
  keyColor: Rgb
  keyIntensity: number
  hemiSky: Rgb
  hemiGround: Rgb
  hemiIntensity: number
  fogColor: Rgb
  fogDensity: number
  skyTop: Rgb
  skyMid: Rgb
  horizon: Rgb
  sunColor: Rgb
  /** Видимость диска солнца (облака, осадки, ночь). */
  sunVis: number
  night: number
  golden: number
  lamps: number
  stars: number
  overcast: number
  wetness: number
  snowCover: number
  /** Интенсивность осадков и ветер, 0..1 (сглаженные): дождь/снег — штрихи в weather/Precipitation.tsx. */
  rain: number
  snow: number
  wind: number
  /** Вспышка молнии 0..1: пишет weather/Lightning.tsx каждый кадр (не сглаживается и не копируется тиком). */
  flash: number
}

// ───────── Цвета: hex → линейный sRGB без аллокаций ─────────
const hexDigit = (c: number): number => (c <= 57 ? c - 48 : (c | 32) - 87)
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** '#rrggbb' → линейный RGB × gain. Без строк-копий и массивов. */
export function hexToLinear(hex: string, out: Rgb, gain = 1): Rgb {
  out.r = toLinear(((hexDigit(hex.charCodeAt(1)) << 4) | hexDigit(hex.charCodeAt(2))) / 255) * gain
  out.g = toLinear(((hexDigit(hex.charCodeAt(3)) << 4) | hexDigit(hex.charCodeAt(4))) / 255) * gain
  out.b = toLinear(((hexDigit(hex.charCodeAt(5)) << 4) | hexDigit(hex.charCodeAt(6))) / 255) * gain
  return out
}

const rgb = (): Rgb => ({ r: 0, g: 0, b: 0 })
const vec = (x = 0, y = 1, z = 0): Vec3 => ({ x, y, z })

function mixRgb(a: Rgb, b: Rgb, t: number, out: Rgb): Rgb {
  out.r = lerp(a.r, b.r, t)
  out.g = lerp(a.g, b.g, t)
  out.b = lerp(a.b, b.b, t)
  return out
}

function saturate(c: Rgb, k: number): void {
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  c.r = Math.max(0, lum + (c.r - lum) * k)
  c.g = Math.max(0, lum + (c.g - lum) * k)
  c.b = Math.max(0, lum + (c.b - lum) * k)
}

// Константные палитры (не из Плана): оттенки света. Создаются один раз на модуль.
const SUN_DAY = hexToLinear('#fff1dc', rgb())
const SUN_GOLD = hexToLinear('#ff8a3c', rgb())
const MOON_COL = hexToLinear('#9db4ff', rgb())
const NIGHT_AMBIENT = hexToLinear('#3a4a85', rgb())
const GROUND_DAY = hexToLinear('#6b5d4f', rgb())
const GROUND_NIGHT = hexToLinear('#161c30', rgb())
// Не из Плана (задание арт-директора S4): холодно-розовая палитра тумана и пол яркости теней.
const FOG_TOP = hexToLinear('#9a8fb2', rgb())
const FOG_MID = hexToLinear('#b9a2ba', rgb())
const FOG_HOR = hexToLinear('#d6b9c6', rgb())
/** Пол яркости: ночью — тени индиго `#1b1530` (План §1), днём (туман, пасмурно) — `#4a3a48`. Линейный RGB, до тональной компрессии. */
const FLOOR_NIGHT = hexToLinear('#1b1530', rgb())
const FLOOR_DAY = hexToLinear('#4a3a48', rgb())
const tmpA = rgb()
const tmpB = rgb()
const tmpC = rgb()

// ───────── Солнце и луна ─────────
/** Склонение Солнца, рад, по месяцу 0..11 (середина месяца). */
function declination(month: number): number {
  const day = (((Math.floor(month) % 12) + 12) % 12) * 30.4375 + 15.2
  return 23.44 * DEG * Math.sin((TAU * (day - 80)) / 365)
}

/** Азимут (от севера по часовой, рад) восхода: cos(az) = sin(δ)/cos(φ). */
function riseAzimuth(month: number): number {
  return Math.acos(clamp(Math.sin(declination(month)) / Math.cos(LAT_RAD), -1, 1))
}

function fromAltAz(alt: number, az: number, out: Vec3): Vec3 {
  const c = Math.cos(alt)
  out.x = Math.sin(az) * c // +X восток
  out.y = Math.sin(alt)
  out.z = -Math.cos(az) * c // −Z север
  return out
}

/** Часы суток 0..24 из минут. */
const hoursOf = (minutes: number): number => (((minutes % 1440) + 1440) % 1440) / 60

/**
 * Единичный вектор НА солнце в мировых осях (+X восток, −Z север, +Y вверх).
 * Днём (между `sunTimes`) высота = hMax·sin(π·u), u — доля дня: на восходе и закате ≈ 0, в полдень максимум;
 * hMax = 90° − φ + δ (июнь ≈ 57.7°, декабрь ≈ 10.8°). Азимут линейно по u от точки восхода через юг к точке заката.
 * Ночью солнце под горизонтом (глубина до 15°), азимут идёт через север.
 */
export function sunDirection(minutes: number, month: number, out: Vec3 = vec()): Vec3 {
  const hours = hoursOf(minutes)
  const [rise, set] = sunTimes(month)
  const azR = riseAzimuth(month)
  if (hours >= rise && hours <= set) {
    const u = (hours - rise) / (set - rise)
    const hMax = Math.PI / 2 - LAT_RAD + declination(month)
    return fromAltAz(hMax * Math.sin(Math.PI * u), azR + (TAU - 2 * azR) * u, out)
  }
  const nightLen = 24 - (set - rise)
  const since = hours > set ? hours - set : hours + 24 - set
  const w = since / nightLen
  return fromAltAz(-SUN_NIGHT_DEPTH * Math.sin(Math.PI * w), TAU - azR + 2 * azR * w, out)
}

/**
 * Единичный вектор НА луну: ночью дуга с востока (закат) через юг к западу (восход), высота ≤ 40°;
 * днём луна под горизонтом.
 */
export function moonDirection(minutes: number, month: number, out: Vec3 = vec()): Vec3 {
  const hours = hoursOf(minutes)
  const [rise, set] = sunTimes(month)
  if (hours >= rise && hours <= set) {
    const u = (hours - rise) / (set - rise)
    return fromAltAz(-MOON_MAX_ALT * Math.sin(Math.PI * u), (90 + 180 * u) * DEG, out)
  }
  const nightLen = 24 - (set - rise)
  const since = hours > set ? hours - set : hours + 24 - set
  const w = since / nightLen
  return fromAltAz(MOON_MAX_ALT * Math.sin(Math.PI * w), (90 + 180 * w) * DEG, out)
}

// ───────── Чистые функции: Lighting → числа ─────────
export function makeLightingUniforms(): LightingUniforms {
  return {
    skyTop: rgb(),
    skyMid: rgb(),
    horizon: rgb(),
    sunColor: rgb(),
    hemiSky: rgb(),
    hemiGround: rgb(),
    sunIntensity: 0,
    moonIntensity: 0,
    hemiIntensity: 0,
    night: 0,
    golden: 0,
    lamps: 0,
    stars: 0,
  }
}

/**
 * Палитра неба, цвет и сила света по `Lighting` (то, что `getLighting` знает о времени суток и погоде).
 * Монотонно: чем больше `night`, тем меньше `sunIntensity` и `hemiIntensity`. Все значения конечны.
 * Туман и горизонт неба используют один и тот же `horizon` — горизонт сходится с небом.
 */
export function lightingUniforms(l: Lighting, out: LightingUniforms = makeLightingUniforms()): LightingUniforms {
  const night = clamp(l.night)
  const golden = clamp(l.golden)
  const dayClear = (1 - night) * (1 - golden)
  const gain = lerp(SKY_GAIN, SKY_GAIN_DAY, dayClear)
  hexToLinear(l.skyTop, out.skyTop, gain)
  hexToLinear(l.skyMid, out.skyMid, gain)
  hexToLinear(l.skyBottom, tmpA, gain)
  mixRgb(out.skyMid, out.skyTop, DAY_MID_COOL * dayClear, out.skyMid)
  mixRgb(tmpA, out.skyMid, 0.4, out.horizon)
  mixRgb(out.horizon, out.skyTop, DAY_HORIZON_COOL * dayClear, out.horizon)
  saturate(out.skyTop, SKY_SATURATION)
  saturate(out.skyMid, SKY_SATURATION)
  saturate(out.horizon, SKY_SATURATION)

  mixRgb(SUN_DAY, SUN_GOLD, golden, out.sunColor)
  out.sunIntensity = SUN_I * (1 - night) * lerp(1, 0.8, golden)
  out.moonIntensity = MOON_I * night
  out.hemiIntensity = lerp(HEMI_DAY_I, HEMI_NIGHT_I, night)

  mixRgb(out.skyTop, out.skyMid, 0.5, tmpB)
  mixRgb(tmpB, NIGHT_AMBIENT, night * 0.7, out.hemiSky)
  mixRgb(GROUND_DAY, SUN_GOLD, golden * 0.25, tmpC)
  mixRgb(tmpC, GROUND_NIGHT, night, out.hemiGround)

  out.night = night
  out.golden = golden
  out.lamps = clamp(l.lamps)
  out.stars = clamp(l.stars)
  return out
}

// ───────── Небо по погоде и видимость ─────────
/** Не из Плана: в пасмурный день зенит темнее, горизонт почти не меняется → небо читается градиентом, а не молоком. */
export const OVERCAST_DIM_TOP = 0.42
export const OVERCAST_DIM_MID = 0.24
export const OVERCAST_DIM_HOR = 0.06
/** Не из Плана: доля холодно-розовой палитры при полном тумане (дальше — по `weather.fog`). */
export const FOG_PINK_MIX = 0.85
/** Задание арт-директора S4: видимость до ориентира (контраст 5 %), м — в тумане и в дождь/снег. */
export const VIS_FOG_M = 400
export const VIS_PRECIP_M = 800
/** exp(−k²) = 5 %: плотность exp2-тумана d даёт видимость k / d. */
const VIS_CONTRAST_K = 1.73

/** Максимальная плотность тумана (1/м), при которой ориентир виден не ближе нужного: туман → 400 м, дождь/снег → 800 м. */
export function visibilityDensityCap(weatherFog: number): number {
  const t = smooth(clamp((weatherFog - 0.4) / 0.4))
  return VIS_CONTRAST_K / lerp(VIS_PRECIP_M, VIS_FOG_M, t)
}

/** Погодная правка палитры неба (на месте): пасмурный день — тёмный зенит; туман — холодно-розовая палитра. */
export function gradeSky(top: Rgb, mid: Rgb, hor: Rgb, overcast: number, weatherFog: number, night: number): void {
  const day = 1 - clamp(night)
  const oc = clamp(overcast) * day
  const dim = (c: Rgb, k: number): void => {
    c.r *= k
    c.g *= k
    c.b *= k
  }
  dim(top, 1 - OVERCAST_DIM_TOP * oc)
  dim(mid, 1 - OVERCAST_DIM_MID * oc)
  dim(hor, 1 - OVERCAST_DIM_HOR * oc)
  const f = smooth(clamp((weatherFog - 0.4) / 0.4)) * day * FOG_PINK_MIX
  if (f > 0) {
    mixRgb(top, FOG_TOP, f, top)
    mixRgb(mid, FOG_MID, f, mid)
    mixRgb(hor, FOG_HOR, f, hor)
  }
}

/** Не из Плана: базовая плотность экспоненциального тумана (exp2), 1/м. */
export const FOG_BASE = 0.0007
/** Не из Плана: во сколько раз редеет базовая дымка ясным днём (дальние дома видны, а не тонут в молоке). */
export const DAY_FOG_K = 0.55

/** Доля базовой дымки: 1 ночью, на золотом часе (наполовину) и в облачную погоду, `DAY_FOG_K` ясным днём. */
export function hazeFactor(night: number, golden: number, overcast: number): number {
  return lerp(DAY_FOG_K, 1, Math.max(clamp(night), clamp(golden) * 0.5, clamp(overcast)))
}

/** Плотность тумана по фазе суток и погоде: убирает из `weatherFactors.fogDensity` часть базовой дымки днём. */
export function fogDensityFor(weatherFog: number, night: number, golden: number, overcast: number): number {
  return Math.max(0, weatherFog - FOG_BASE * (1 - hazeFactor(night, golden, overcast)))
}

/** Не из Плана: влияние погоды на прямой свет, рассеянный свет и туман. */
export function weatherFactors(w: WeatherParams, out: WeatherFactors): WeatherFactors {
  const precip = Math.max(w.rain, w.snow, w.storm)
  out.overcast = clamp(w.cloud * 0.85 + w.fog * 0.3 + w.rain * 0.3 + w.snow * 0.2 + w.storm * 0.3)
  out.direct = Math.max(0.04, (1 - w.cloud * 0.9) * (1 - clamp(precip * 1.6)))
  out.fogDensity = FOG_BASE + w.fog * 0.004 + out.overcast * 0.0004 + w.rain * 0.0008 + w.snow * 0.0012
  return out
}

// ───────── Состояние ─────────
function makeState(): WorldLightState {
  return {
    sunDir: vec(0, 1, 0),
    moonDir: vec(0, -1, 0),
    keyDir: vec(0, 1, 0),
    keyColor: rgb(),
    keyIntensity: 0,
    hemiSky: rgb(),
    hemiGround: rgb(),
    hemiIntensity: 0,
    fogColor: rgb(),
    fogDensity: 0.001,
    skyTop: rgb(),
    skyMid: rgb(),
    horizon: rgb(),
    sunColor: rgb(),
    sunVis: 0,
    night: 0,
    golden: 0,
    lamps: 0,
    stars: 0,
    overcast: 0,
    wetness: 0,
    snowCover: 0,
    rain: 0,
    snow: 0,
    wind: 0,
    flash: 0,
  }
}

/**
 * Uniforms фасадного шейдера (city/facadeMaterial.ts): простые объекты `{ value }`, создаются один раз,
 * `stepWorldLight` пишет их каждый кадр. three здесь не нужен (vec3 — `{x,y,z}`).
 */
export const facadeUniforms = {
  uWet: { value: 0 },
  uSnow: { value: 0 },
  uNight: { value: 0 },
  /** Яркость фонарей 0..1 (city/Lamps.tsx). */
  uLamps: { value: 0 },
  /** Пол яркости (линейный RGB): max(освещение, пол) — без чистого чёрного (Ground, фасады). */
  uFloor: { value: { x: 0, y: 0, z: 0 } },
  /** Плотность тумана 1/м: блики фонарей на мокром гаснут в тумане по расстоянию до фонаря. */
  uFogD: { value: 0 },
  uSky: { value: { x: 0, y: 0, z: 0 } },
}

/** Текущие (сглаженные) значения — их читают компоненты в `useFrame`. */
export const worldLight: WorldLightState = makeState()
const target: WorldLightState = makeState()
const uni = makeLightingUniforms()
const wf: WeatherFactors = { overcast: 0, direct: 1, fogDensity: 0.001 }

let ticks = 0
let month = 0
let monthSeason = ''
let snapNext = true

function setRgb(o: Rgb, r: number, g: number, b: number): void {
  o.r = r
  o.g = g
  o.b = b
}
const copyRgb = (to: Rgb, from: Rgb): void => setRgb(to, from.r, from.g, from.b)
const copyVec = (to: Vec3, from: Vec3): void => {
  to.x = from.x
  to.y = from.y
  to.z = from.z
}

/** Один пересчёт целей: `getLighting` + стор → `target`. Без собственных аллокаций (аллоцирует только getLighting). */
export function tickWorldLight(): void {
  const s = useWorldStore.getState()
  if (ticks++ % MONTH_REFRESH_TICKS === 0 || s.season !== monthSeason) {
    month = lightingMonth(s.season)
    monthSeason = s.season
  }
  const l = getLighting(s.minutes, s.weather, s.season, month)
  lightingUniforms(l, uni)
  weatherFactors(s.weather, wf)
  sunDirection(s.minutes, month, target.sunDir)
  moonDirection(s.minutes, month, target.moonDir)

  const sinAlt = target.sunDir.y
  if (sinAlt > 0) {
    copyVec(target.keyDir, target.sunDir)
    copyRgb(target.keyColor, uni.sunColor)
    target.keyIntensity = uni.sunIntensity * wf.direct * smooth(clamp(sinAlt / 0.12))
  } else {
    copyVec(target.keyDir, target.moonDir)
    copyRgb(target.keyColor, MOON_COL)
    target.keyIntensity = uni.moonIntensity * wf.direct * smooth(clamp(-sinAlt / 0.12))
  }
  // Облачность поднимает рассеянный свет: энергия прямого света уходит в небо.
  target.hemiIntensity = uni.hemiIntensity * (1 + 0.7 * wf.overcast * (1 - uni.night))
  copyRgb(target.hemiSky, uni.hemiSky)
  copyRgb(target.hemiGround, uni.hemiGround)
  copyRgb(target.skyTop, uni.skyTop)
  copyRgb(target.skyMid, uni.skyMid)
  copyRgb(target.horizon, uni.horizon)
  gradeSky(target.skyTop, target.skyMid, target.horizon, wf.overcast, s.weather.fog, uni.night)
  copyRgb(target.fogColor, target.horizon)
  copyRgb(target.sunColor, uni.sunColor)
  target.fogDensity = Math.min(
    fogDensityFor(wf.fogDensity, uni.night, uni.golden, wf.overcast),
    visibilityDensityCap(s.weather.fog),
  )
  target.sunVis = wf.direct * (1 - uni.night)
  target.night = uni.night
  target.golden = uni.golden
  target.lamps = uni.lamps
  target.stars = uni.stars
  target.overcast = wf.overcast
  target.wetness = s.wetness
  target.snowCover = s.snowCover
  target.rain = clamp(Math.max(s.weather.rain, s.weather.storm * 0.9))
  target.snow = clamp(s.weather.snow)
  target.wind = clamp(Math.max(s.weather.wind, s.weather.storm * 0.7))

  if (snapNext) {
    snapNext = false
    copyState(worldLight, target)
  }
}

function copyState(to: WorldLightState, from: WorldLightState): void {
  copyVec(to.sunDir, from.sunDir)
  copyVec(to.moonDir, from.moonDir)
  copyVec(to.keyDir, from.keyDir)
  copyRgb(to.keyColor, from.keyColor)
  to.keyIntensity = from.keyIntensity
  copyRgb(to.hemiSky, from.hemiSky)
  copyRgb(to.hemiGround, from.hemiGround)
  to.hemiIntensity = from.hemiIntensity
  copyRgb(to.fogColor, from.fogColor)
  to.fogDensity = from.fogDensity
  copyRgb(to.skyTop, from.skyTop)
  copyRgb(to.skyMid, from.skyMid)
  copyRgb(to.horizon, from.horizon)
  copyRgb(to.sunColor, from.sunColor)
  to.sunVis = from.sunVis
  to.night = from.night
  to.golden = from.golden
  to.lamps = from.lamps
  to.stars = from.stars
  to.overcast = from.overcast
  to.wetness = from.wetness
  to.snowCover = from.snowCover
  to.rain = from.rain
  to.snow = from.snow
  to.wind = from.wind
}

const dn = (a: number, b: number, k: number): number => a + (b - a) * k
function dampRgb(c: Rgb, t: Rgb, k: number): void {
  c.r = dn(c.r, t.r, k)
  c.g = dn(c.g, t.g, k)
  c.b = dn(c.b, t.b, k)
}
function dampVec(c: Vec3, t: Vec3, k: number): void {
  c.x = dn(c.x, t.x, k)
  c.y = dn(c.y, t.y, k)
  c.z = dn(c.z, t.z, k)
  const len = Math.hypot(c.x, c.y, c.z)
  if (len > 1e-6) {
    c.x /= len
    c.y /= len
    c.z /= len
  } else {
    copyVec(c, t)
  }
}

/** Вызывать из `useFrame` (dt уже ограничен `stepDelta`). Ноль аллокаций. */
export function stepWorldLight(dt: number): void {
  const k = dampAlpha(SMOOTH_LAMBDA, dt)
  const w = worldLight
  const t = target
  dampVec(w.sunDir, t.sunDir, k)
  dampVec(w.moonDir, t.moonDir, k)
  dampVec(w.keyDir, t.keyDir, k)
  dampRgb(w.keyColor, t.keyColor, k)
  w.keyIntensity = dn(w.keyIntensity, t.keyIntensity, k)
  dampRgb(w.hemiSky, t.hemiSky, k)
  dampRgb(w.hemiGround, t.hemiGround, k)
  w.hemiIntensity = dn(w.hemiIntensity, t.hemiIntensity, k)
  dampRgb(w.fogColor, t.fogColor, k)
  w.fogDensity = dn(w.fogDensity, t.fogDensity, k)
  dampRgb(w.skyTop, t.skyTop, k)
  dampRgb(w.skyMid, t.skyMid, k)
  dampRgb(w.horizon, t.horizon, k)
  dampRgb(w.sunColor, t.sunColor, k)
  w.sunVis = dn(w.sunVis, t.sunVis, k)
  w.night = dn(w.night, t.night, k)
  w.golden = dn(w.golden, t.golden, k)
  w.lamps = dn(w.lamps, t.lamps, k)
  w.stars = dn(w.stars, t.stars, k)
  w.overcast = dn(w.overcast, t.overcast, k)
  w.wetness = dn(w.wetness, t.wetness, k)
  w.snowCover = dn(w.snowCover, t.snowCover, k)
  w.rain = dn(w.rain, t.rain, k)
  w.snow = dn(w.snow, t.snow, k)
  w.wind = dn(w.wind, t.wind, k)
  facadeUniforms.uWet.value = w.wetness
  facadeUniforms.uSnow.value = w.snowCover
  facadeUniforms.uNight.value = w.night
  facadeUniforms.uLamps.value = w.lamps
  facadeUniforms.uSky.value.x = w.horizon.r
  facadeUniforms.uSky.value.y = w.horizon.g
  facadeUniforms.uSky.value.z = w.horizon.b
  const fl = facadeUniforms.uFloor.value
  const nk = clamp(w.night)
  fl.x = lerp(FLOOR_DAY.r, FLOOR_NIGHT.r, nk)
  fl.y = lerp(FLOOR_DAY.g, FLOOR_NIGHT.g, nk)
  fl.z = lerp(FLOOR_DAY.b, FLOOR_NIGHT.b, nk)
  facadeUniforms.uFogD.value = w.fogDensity
}

/** Запуск моста: первый тик сразу (без сглаживания), далее раз в 250 мс; в скрытой вкладке интервал стоит. */
export function startWorldLight(): () => void {
  let timer: ReturnType<typeof setInterval> | null = null
  const stop = (): void => {
    if (timer !== null) clearInterval(timer)
    timer = null
  }
  const start = (): void => {
    if (timer === null) timer = setInterval(tickWorldLight, TICK_MS)
  }
  snapNext = true
  tickWorldLight()
  if (!isPageHidden()) start()
  const off = onPageVisibility((hidden) => {
    if (hidden) {
      stop()
    } else {
      tickWorldLight()
      start()
    }
  })
  return () => {
    stop()
    off()
  }
}
