import { type Rng, chance, pick } from './rng'

export const STEPS = 16

/** Один такт: громкости 0..1 по 16 шагам (0 = пауза). */
export interface DrumBar {
  kick: number[]
  snare: number[]
  hat: number[]
  openHat: number[]
}

const zeros = (): number[] => new Array(STEPS).fill(0)

const KICKS: number[][] = [[0, 10], [0, 7, 10], [0, 3, 10], [0, 6, 11], [0, 10, 14]]

/** Базовый lofi-бит: ленивый кик, снейр на 2 и 4, неровные хэты. intensity 0..1 */
export function generateDrumPattern(rng: Rng, intensity = 0.6): DrumBar {
  const bar: DrumBar = { kick: zeros(), snare: zeros(), hat: zeros(), openHat: zeros() }
  for (const s of pick(rng, KICKS)) bar.kick[s] = 0.75 + rng() * 0.25
  if (chance(rng, 0.35 * intensity)) bar.kick[15] = 0.3 + rng() * 0.2
  bar.snare[4] = 0.7 + rng() * 0.2
  bar.snare[12] = 0.75 + rng() * 0.2
  if (chance(rng, 0.3 * intensity)) bar.snare[chance(rng, 0.5) ? 7 : 15] = 0.2 + rng() * 0.15
  const eighths = chance(rng, 0.7)
  for (let s = 0; s < STEPS; s++) {
    if (eighths && s % 2 === 1) continue
    if (!eighths && s % 2 === 1 && !chance(rng, 0.5 * intensity)) continue
    const accent = s % 4 === 0 ? 0.55 : s % 2 === 0 ? 0.4 : 0.22
    bar.hat[s] = Math.min(1, accent * (0.7 + rng() * 0.5))
  }
  if (chance(rng, 0.5)) bar.openHat[chance(rng, 0.5) ? 6 : 14] = 0.35 + rng() * 0.2
  return bar
}

/** Размножает паттерн на `bars` тактов; последние такты с лёгким филлом/вариацией. */
export function drumBarsFor(rng: Rng, base: DrumBar, bars: number): DrumBar[] {
  const out: DrumBar[] = []
  for (let b = 0; b < bars; b++) {
    const c: DrumBar = { kick: [...base.kick], snare: [...base.snare], hat: [...base.hat], openHat: [...base.openHat] }
    if (b === bars - 1 && chance(rng, 0.6)) {
      c.snare[14] = 0.3 + rng() * 0.2
      c.snare[15] = 0.25 + rng() * 0.2
      c.kick[11] = 0.5
    } else if (b % 2 === 1 && chance(rng, 0.4)) {
      c.kick[chance(rng, 0.5) ? 3 : 14] = 0.4
    }
    out.push(c)
  }
  return out
}
