/**
 * Уровни качества 3D. Источник чисел — docs/CINEMATIC_3D_PLAN.md (§3 frame.ts, §5, §6, §7, §9).
 * Чистая логика: без three, без стора, без таймеров.
 */
import type { QualityLevel } from '../types'

export interface QualitySettings {
  readonly level: QualityLevel
  /** §6: верхняя граница devicePixelRatio. */
  readonly dprMax: number
  /** §6/§5: число каскадов теневой карты; 0 = без теней (Low: запечённая AO-подложка). */
  readonly shadowCascades: number
  /** §5: размер карты теней, px; 0 = нет теней. */
  readonly shadowMapSize: number
  /** §3 (frame.ts): радиус теней вокруг камеры, м — High 600 (каскады), Medium 250; 0 = нет теней. */
  readonly shadowRadiusM: number
  /** §6: N8AO — масштаб разрешения: 1 полное, 0.5 половинное, 0 = проход выключен. */
  readonly aoResolutionScale: number
  /** §6: Bloom включён на всех уровнях. */
  readonly bloom: boolean
  /** §6: число уровней mipmapBlur (Low: 5 → 3). */
  readonly bloomLevels: number
  /** §6: DepthOfField (только High и только в планах с `dof`). */
  readonly depthOfField: boolean
  /** §5/§6: зеркальная текстура дороги при wetness > 0.3. */
  readonly roadReflections: boolean
  /** §5: масштаб разрешения отражений дороги — «половинное разрешение» (0 = нет). */
  readonly roadReflectionScale: number
  /** §6: объёмные облака. */
  readonly volumetricClouds: boolean
  /** §5: физическая атмосфера (@takram) на High/Medium; Low — градиент. */
  readonly physicalAtmosphere: boolean
  /** §5: максимум PointLight (≤ 8 ближайших к камере). */
  readonly pointLightsMax: number
  /** §5: верхняя граница штрихов дождя/снега. */
  readonly precipitationMax: number
  /** §7: толпа, прохожих. */
  readonly crowdMax: number
}

const HIGH: QualitySettings = Object.freeze({
  level: 'high',
  dprMax: 1.5,
  shadowCascades: 3,
  shadowMapSize: 2048,
  shadowRadiusM: 600,
  aoResolutionScale: 1,
  bloom: true,
  bloomLevels: 5,
  depthOfField: true,
  roadReflections: true,
  roadReflectionScale: 0.5,
  volumetricClouds: true,
  physicalAtmosphere: true,
  pointLightsMax: 8,
  precipitationMax: 8000,
  crowdMax: 40,
})

const MEDIUM: QualitySettings = Object.freeze({
  level: 'medium',
  dprMax: 1.25,
  shadowCascades: 1,
  shadowMapSize: 2048,
  shadowRadiusM: 250,
  aoResolutionScale: 0.5,
  bloom: true,
  bloomLevels: 5,
  depthOfField: false,
  roadReflections: true,
  roadReflectionScale: 0.5,
  volumetricClouds: false,
  physicalAtmosphere: true,
  pointLightsMax: 8,
  precipitationMax: 5000,
  crowdMax: 24,
})

const LOW: QualitySettings = Object.freeze({
  level: 'low',
  dprMax: 1,
  shadowCascades: 0,
  shadowMapSize: 0,
  shadowRadiusM: 0,
  aoResolutionScale: 0,
  bloom: true,
  bloomLevels: 3,
  depthOfField: false,
  roadReflections: false,
  roadReflectionScale: 0,
  volumetricClouds: false,
  physicalAtmosphere: false,
  pointLightsMax: 8,
  precipitationMax: 3000,
  crowdMax: 12,
})

/** Возвращает один и тот же замороженный объект на уровень; без аллокаций. */
export function qualitySettings(level: QualityLevel): QualitySettings {
  return level === 'high' ? HIGH : level === 'medium' ? MEDIUM : LOW
}

/** Порядок от лучшего к худшему. */
export const QUALITY_ORDER: readonly QualityLevel[] = Object.freeze(['high', 'medium', 'low'] as QualityLevel[])

/** §9: приёмочные FPS (медиана, 1600×900) — только для замера (gl-stats). НЕ пороги переключения качества. */
export const BUDGET_FPS: Readonly<Record<QualityLevel, number>> = Object.freeze({
  high: 50,
  medium: 55,
  low: 30,
})

/** §3 (frame.ts), авто-качество: вниз — медиана FPS < 40 (High и Medium) непрерывно 5 с. */
export const DOWNGRADE_FPS = 40
export const DOWNGRADE_HOLD_MS = 5000
/** §3: вверх — медиана ≥ 55 непрерывно 30 с и не раньше 30 с после прошлой смены уровня. */
export const UPGRADE_FPS = 55
export const UPGRADE_HOLD_MS = 30000
export const UPGRADE_COOLDOWN_MS = 30000

export interface AutoQualityState {
  readonly level: QualityLevel
  /** Момент, с которого медиана непрерывно ниже DOWNGRADE_FPS; null — не ниже. */
  readonly belowSinceMs: number | null
  /** Момент, с которого медиана непрерывно ≥ UPGRADE_FPS; null — нет. */
  readonly aboveSinceMs: number | null
  /** Момент последней смены уровня (старт — момент создания состояния). */
  readonly lastChangeMs: number
}

export function initialAutoQuality(level: QualityLevel, nowMs: number): AutoQualityState {
  return { level, belowSinceMs: null, aboveSinceMs: null, lastChangeMs: nowMs }
}

const rank = (l: QualityLevel): number => (l === 'high' ? 0 : l === 'medium' ? 1 : 2)

/**
 * Один шаг авто-качества (вызывать редко, напр. раз в секунду, с готовой медианой FPS).
 * - медиана < 40 непрерывно ≥ 5 с (High, Medium) → ровно на один уровень ниже; ниже Low не идёт;
 * - медиана ≥ 55 непрерывно ≥ 30 с и не раньше 30 с после последней смены → на один уровень выше,
 *   но не выше `ceiling` (выбор пользователя).
 * Чистая функция: время приходит аргументом.
 */
export function stepAutoQuality(
  s: AutoQualityState,
  medianFps: number,
  nowMs: number,
  ceiling: QualityLevel = 'high',
): AutoQualityState {
  const cur = s.level
  const r = rank(cur)
  const below = medianFps < DOWNGRADE_FPS && r < 2
  const above = medianFps >= UPGRADE_FPS && r > rank(ceiling)
  const belowSince = below ? (s.belowSinceMs ?? nowMs) : null
  const aboveSince = above ? (s.aboveSinceMs ?? nowMs) : null
  if (belowSince !== null && nowMs - belowSince >= DOWNGRADE_HOLD_MS) {
    return { level: QUALITY_ORDER[r + 1], belowSinceMs: null, aboveSinceMs: null, lastChangeMs: nowMs }
  }
  if (aboveSince !== null && nowMs - aboveSince >= UPGRADE_HOLD_MS && nowMs - s.lastChangeMs >= UPGRADE_COOLDOWN_MS) {
    return { level: QUALITY_ORDER[r - 1], belowSinceMs: null, aboveSinceMs: null, lastChangeMs: nowMs }
  }
  if (belowSince === s.belowSinceMs && aboveSince === s.aboveSinceMs) return s
  return { level: cur, belowSinceMs: belowSince, aboveSinceMs: aboveSince, lastChangeMs: s.lastChangeMs }
}
