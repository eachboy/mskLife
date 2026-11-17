/**
 * Шаг кадра и frameloop. Чистые функции: без подписок, без аллокаций в горячем пути.
 * Подписка на видимость — в World3D через onPageVisibility (src/utils/pageVisibility.ts).
 */
import { clampDelta } from '../utils/pageVisibility'

/** Период накопителя времени для шейдеров, с. Реализационная константа (в Плане не задана). */
export const WORLD_TIME_PERIOD = 3600

/** Шаг анимации: сырой dt (с) → [0; 0.1]. */
export function stepDelta(rawSeconds: number): number {
  return clampDelta(rawSeconds)
}

/**
 * Время мира для `uTime`: t + dt с заворачиванием по периоду, чтобы float32 в шейдере не терял точность.
 * Период должен быть кратен периодам функций в шейдерах (целое число секунд), тогда шва нет.
 */
export function advanceWorldTime(t: number, rawSeconds: number, period: number = WORLD_TIME_PERIOD): number {
  const next = t + clampDelta(rawSeconds)
  return next >= period ? next % period : next
}

/** Решение frameloop по видимости страницы: скрыта → 'never' (0 draw calls). */
export function frameloopFor(hidden: boolean): 'always' | 'never' {
  return hidden ? 'never' : 'always'
}
