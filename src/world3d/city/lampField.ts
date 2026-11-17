/**
 * Уличные фонари (План §5 «Ночь»): расстановка и выбор ближайших. Чистые функции, без three и React.
 *
 * В запечённом тайле фонарей нет (в OSM-запросе только здания), поэтому они расставляются детерминированно по
 * кромке тротуара из поля расстояний до стен (то же, по которому Ground рисует тротуар): кандидаты — ячейки
 * «снаружи» (достижимые с края карты через ячейки дальше 1 м от стен; закрытые дворы и внутренности зданий
 * отсекаются) на расстоянии `SIDEWALK_M − 0.65 … − 0.15` от стены; из перемешанного `mulberry32` списка
 * принимается кандидат, если рядом (< `LAMP_MIN_SPACING_M`) нет принятого. Рука фонаря смотрит на проезжую
 * часть — по градиенту поля.
 */
import { mulberry32 } from '../../utils/math'
import { DF_MAX_M, type DistanceField, SIDEWALK_M } from './distanceField'

// ───────── Числа (не из Плана: Plan §5 задаёт лишь «инстансы плашек + ≤ 8 PointLight»; остальное подобрано по кадрам) ─────────
/** Высота верха столба и вылет руки к проезжей части, м. */
export const LAMP_HEIGHT_M = 7
export const LAMP_ARM_M = 1.4
/** Положение светильника (низ плашки): вылет вдоль руки и высота, м. */
export const LAMP_HEAD_X_M = 1.2
export const LAMP_HEAD_Y_M = LAMP_HEIGHT_M - 0.3
/** Минимальное расстояние между фонарями, м (в среднем вдоль кромки получается 28–45 м). */
export const LAMP_MIN_SPACING_M = 26
/** Потолок числа фонарей на район. */
export const LAMP_MAX = 1500
/** Полоса расстояний до стены, в которой стоят столбы. */
export const LAMP_BAND_MIN_M = SIDEWALK_M - 0.65
export const LAMP_BAND_MAX_M = SIDEWALK_M - 0.15
/** Стена ближе этого расстояния не пропускает «наружу» (заливка от края карты). */
const OUTSIDE_MIN_M = 1.0
/** Seed расстановки: один и тот же район — одни и те же фонари. */
export const LAMP_SEED = 20261117

/** Число float на фонарь в массиве расстановки: x, z, dx, dz (единичный вектор руки). */
export const LAMP_STRIDE = 4

/** Ячейки «снаружи»: заливка (4-связность) от границы карты через ячейки дальше `OUTSIDE_MIN_M` от стен. */
export function outsideMask(f: DistanceField): Uint8Array {
  const { data, size } = f
  const qMin = Math.ceil((OUTSIDE_MIN_M / DF_MAX_M) * 255)
  const mask = new Uint8Array(size * size)
  const stack = new Int32Array(size * size)
  let sp = 0
  const push = (i: number): void => {
    if (mask[i] === 0 && data[i] > qMin) {
      mask[i] = 1
      stack[sp++] = i
    }
  }
  for (let k = 0; k < size; k++) {
    push(k)
    push((size - 1) * size + k)
    push(k * size)
    push(k * size + size - 1)
  }
  while (sp > 0) {
    const i = stack[--sp]
    const x = i % size
    if (x > 0) push(i - 1)
    if (x < size - 1) push(i + 1)
    if (i >= size) push(i - size)
    if (i < size * (size - 1)) push(i + size)
  }
  return mask
}

/** Расстановка: Float32Array длиной `LAMP_STRIDE · n` (x, z, dx, dz) в координатах тайла (центр района — 0). */
export function placeLamps(
  f: DistanceField,
  seed: number = LAMP_SEED,
  spacing: number = LAMP_MIN_SPACING_M,
  /** Готовая маска `outsideMask(f)`: загрузка считает её отдельным шагом, чтобы ни один кадр не получил > 50 мс. */
  mask: Uint8Array = outsideMask(f),
): Float32Array {
  const { data, size, minX, minZ, extent } = f
  const cell = extent / size
  const inside = mask
  const qLo = Math.round((LAMP_BAND_MIN_M / DF_MAX_M) * 255)
  const qHi = Math.round((LAMP_BAND_MAX_M / DF_MAX_M) * 255)
  const candBuf = new Int32Array(((size * size) >> 2) + 16)
  let cn = 0
  for (let j = 1; j < size - 1; j++) {
    for (let i = 1; i < size - 1; i++) {
      const k = j * size + i
      if (inside[k] === 1 && data[k] >= qLo && data[k] <= qHi && cn < candBuf.length) candBuf[cn++] = k
    }
  }
  const cand = candBuf.subarray(0, cn)
  const rng = mulberry32(seed)
  for (let k = cand.length - 1; k > 0; k--) {
    const r = Math.floor(rng() * (k + 1))
    const t = cand[k]
    cand[k] = cand[r]
    cand[r] = t
  }
  // сетка принятых: ячейка = spacing, в ней список через head/next
  const gw = Math.ceil(extent / spacing) + 1
  const head = new Int32Array(gw * gw).fill(-1)
  const next = new Int32Array(LAMP_MAX).fill(-1)
  const out = new Float32Array(LAMP_MAX * LAMP_STRIDE)
  const sp2 = spacing * spacing
  const step = 2
  let n = 0
  for (let c = 0; c < cand.length && n < LAMP_MAX; c++) {
    const k = cand[c]
    const i = k % size
    const j = (k - i) / size
    const x = minX + (i + 0.5) * cell
    const z = minZ + (j + 0.5) * cell
    const gx = Math.floor((x - minX) / spacing)
    const gz = Math.floor((z - minZ) / spacing)
    let free = true
    for (let oz = -1; oz <= 1 && free; oz++) {
      for (let ox = -1; ox <= 1 && free; ox++) {
        const cx = gx + ox
        const cz = gz + oz
        if (cx < 0 || cz < 0 || cx >= gw || cz >= gw) continue
        for (let a = head[cz * gw + cx]; a >= 0; a = next[a]) {
          const dx = out[a * LAMP_STRIDE] - x
          const dz = out[a * LAMP_STRIDE + 1] - z
          if (dx * dx + dz * dz < sp2) {
            free = false
            break
          }
        }
      }
    }
    if (!free) continue
    // рука — по градиенту поля (к проезжей части); вырожденный градиент — кандидат пропускается
    if (i < step || j < step || i >= size - step || j >= size - step) continue
    const gxv = data[k + step] - data[k - step]
    const gzv = data[k + step * size] - data[k - step * size]
    const len = Math.hypot(gxv, gzv)
    if (len < 1e-3) continue
    out[n * LAMP_STRIDE] = x
    out[n * LAMP_STRIDE + 1] = z
    out[n * LAMP_STRIDE + 2] = gxv / len
    out[n * LAMP_STRIDE + 3] = gzv / len
    next[n] = head[gz * gw + gx]
    head[gz * gw + gx] = n
    n++
  }
  return out.slice(0, n * LAMP_STRIDE)
}

// ───────── Ближайшие к камере ─────────
/** Отсортированный по возрастанию набор ближайших фонарей. Память выделяется один раз. */
export interface NearestSet {
  /** Индексы фонарей (в массиве расстановки), по возрастанию расстояния. */
  idx: Int32Array
  /** Квадраты расстояний в плане, м². */
  d2: Float32Array
  /** Сколько заполнено (≤ capacity). */
  n: number
}

export function makeNearest(capacity: number): NearestSet {
  return { idx: new Int32Array(capacity), d2: new Float32Array(capacity), n: 0 }
}

/**
 * Выбирает `capacity` ближайших к (cx, cz) фонарей вставкой в отсортированный массив. Без аллокаций.
 * `(fx, fz)` и `minAhead` — необязательный отсев: фонарь берётся, только если проекция вектора на него вдоль
 * (fx, fz) не меньше `minAhead`, м (для бликов на мокрой дороге нужны фонари впереди камеры, не позади).
 */
export function selectNearest(
  lamps: Float32Array,
  cx: number,
  cz: number,
  set: NearestSet,
  fx = 0,
  fz = 0,
  minAhead = Number.NEGATIVE_INFINITY,
): void {
  const cap = set.idx.length
  const total = (lamps.length / LAMP_STRIDE) | 0
  let n = 0
  for (let a = 0; a < total; a++) {
    const dx = lamps[a * LAMP_STRIDE] - cx
    const dz = lamps[a * LAMP_STRIDE + 1] - cz
    if (dx * fx + dz * fz < minAhead) continue
    const d2 = dx * dx + dz * dz
    if (n === cap && d2 >= set.d2[n - 1]) continue
    let p = n < cap ? n++ : cap - 1
    while (p > 0 && set.d2[p - 1] > d2) {
      set.d2[p] = set.d2[p - 1]
      set.idx[p] = set.idx[p - 1]
      p--
    }
    set.d2[p] = d2
    set.idx[p] = a
  }
  set.n = n
}

/**
 * Вес k-го в наборе при отборе первых `count` из отсортированных: затухает до 0 к расстоянию первого НЕ
 * выбранного (`d(count)`), поэтому смена состава (камера прошла мимо) происходит на нулевой яркости, без скачка.
 * `reach` ограничивает дальность сверху, м. Нет невыбранного — вес зависит только от `reach`.
 */
export function fadeWeight(set: NearestSet, k: number, count: number, reach: number): number {
  const lim = set.n > count ? Math.min(reach, Math.sqrt(set.d2[count])) : reach
  const d = Math.sqrt(set.d2[k])
  const t = Math.min(1, Math.max(0, (d - 0.55 * lim) / (0.45 * lim)))
  return 1 - t * t * (3 - 2 * t)
}

// ───────── Отражения фонарей на мокрой дороге (шейдер земли) ─────────
/** Сколько ближайших светильников даёт блики на мокром асфальте (шейдер Ground, `quality.roadReflections`). */
export const LAMP_REFL_MAX = 16
/** Дальность бликов, м (вес гаснет к расстоянию первого не выбранного, но не дальше). */
export const LAMP_REFL_REACH_M = 160
/** Uniform-массив vec4 (x, y, z светильника в метрах; w — вес 0..1). Пишет Lamps.tsx, читает Ground.tsx. */
export const lampReflUniforms = { uLamp: { value: new Float32Array(LAMP_REFL_MAX * 4) } }
