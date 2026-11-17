import { describe, expect, it } from 'vitest'
import { MIN_INTENSITY, densityOf, makeSeeds } from './Precipitation'

describe('makeSeeds', () => {
  it('детерминированы и лежат в [0, 1)', () => {
    const a = makeSeeds(500, 7)
    const b = makeSeeds(500, 7)
    expect(a.length).toBe(2000)
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(a.every((v) => v >= 0 && v < 1)).toBe(true)
  })

  it('разные seed — разные потоки; значения не слипаются', () => {
    expect(Array.from(makeSeeds(50, 1))).not.toEqual(Array.from(makeSeeds(50, 2)))
    const s = makeSeeds(4000, 3)
    const mean = s.reduce((x, v) => x + v, 0) / s.length
    expect(mean).toBeGreaterThan(0.45)
    expect(mean).toBeLessThan(0.55)
  })
})

describe('densityOf', () => {
  it('ниже порога — ноль, на 1 — все, растёт монотонно', () => {
    expect(densityOf(MIN_INTENSITY / 2)).toBe(0)
    expect(densityOf(1)).toBe(1)
    expect(densityOf(2)).toBe(1)
    expect(densityOf(0.3)).toBeLessThan(densityOf(0.6))
  })
})
