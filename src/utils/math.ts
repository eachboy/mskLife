export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (t: number) => t * t * (3 - 2 * t)

/** Коэффициент экспоненциального сглаживания, не зависящий от FPS: α = 1 − e^(−λ·dt). */
export const dampAlpha = (lambda: number, dt: number) => 1 - Math.exp(-lambda * Math.max(0, dt))

/** Плавное приближение a → b с частотой λ (1/с); при любом dt даёт один и тот же отклик по времени. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, dampAlpha(lambda, dt))

/** Фигура Лиссажу (t в секундах): медленное «дыхание» камеры в покое. Амплитуды ≈ ±0.30 по X и ±0.14 по Y. */
export const lissajous = (t: number): { x: number; y: number } => ({
  x: Math.sin(t * 0.45) * 0.22 + Math.cos(t * 0.23) * 0.08,
  y: Math.cos(t * 0.35) * 0.14,
})

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <T>(arr: readonly T[], rng: () => number = Math.random): T => arr[Math.floor(rng() * arr.length)]

export function weightedPick<T>(items: readonly { item: T; w: number }[], rng: () => number = Math.random): T {
  const total = items.reduce((s, i) => s + Math.max(0, i.w), 0)
  if (total <= 0) return items[0].item
  let r = rng() * total
  for (const i of items) {
    r -= Math.max(0, i.w)
    if (r <= 0) return i.item
  }
  return items[items.length - 1].item
}

export type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  )
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const rgbToHex = ([r, g, b]: RGB) =>
  '#' +
  [r, g, b]
    .map((v) =>
      Math.round(clamp(v, 0, 255))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')

export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return rgbToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)])
}

export const fmtTime = (minutes: number) => {
  const m = Math.floor(((minutes % 1440) + 1440) % 1440)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
