/**
 * Восход/закат в Москве (Europe/Moscow, UTC+3) по месяцам, часы — округлённые средние значения месяца.
 * Используются освещением (lighting.ts) и фазами суток (simulation/time).
 */
export const SUN_TABLE: readonly (readonly [rise: number, set: number])[] = [
  [8.9, 16.35],
  [8.0, 17.5],
  [6.85, 18.65],
  [5.8, 19.85],
  [4.8, 20.85],
  [3.75, 21.25],
  [4.15, 21.15],
  [5.15, 20.25],
  [6.25, 19.0],
  [7.3, 17.7],
  [8.4, 16.5],
  [8.95, 15.97],
]

/** [восход, закат] для месяца 0..11. */
export function sunTimes(month: number): readonly [number, number] {
  return SUN_TABLE[((Math.floor(month) % 12) + 12) % 12]
}
