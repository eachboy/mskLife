import { describe, expect, it } from 'vitest'
import { activityLevel, dayPhase, moscowNow, moscowParts } from '../time/moscowTime'

describe('Europe/Moscow time', () => {
  it('converts any instant to Moscow wall time regardless of the machine time zone', () => {
    // 21:30 UTC = 00:30 MSK следующего дня
    const p = moscowParts(new Date('2026-01-01T21:30:00Z'))
    expect(p).toMatchObject({ year: 2026, month: 1, day: 2, hours: 0, minutes: 30 })
    expect(moscowNow(new Date('2026-07-15T09:15:30Z')).minutes).toBeCloseTo(12 * 60 + 15.5, 5)
    expect(moscowParts(new Date('2026-03-29T00:00:00Z')).hours).toBe(3) // в Москве нет перевода часов
  })
})

describe('dayPhase', () => {
  it('maps clock time to the six phases (January)', () => {
    expect(dayPhase(3 * 60, 0)).toBe('deep-night')
    expect(dayPhase(8 * 60, 0)).toBe('morning')
    expect(dayPhase(13 * 60, 0)).toBe('day')
    expect(dayPhase(16 * 60, 0)).toBe('sunset')
    expect(dayPhase(19 * 60, 0)).toBe('evening')
    expect(dayPhase(23.5 * 60, 0)).toBe('night')
  })
  it('long June evenings: 20:30 is sunset, 22:30 is evening', () => {
    expect(dayPhase(20.75 * 60, 5)).toBe('sunset')
    expect(dayPhase(22.5 * 60, 5)).toBe('evening')
  })
  it('wraps minutes outside 0..1440', () => {
    expect(dayPhase(1440 + 3 * 60, 0)).toBe('deep-night')
    expect(dayPhase(-60, 0)).toBe('night')
  })
})

describe('activityLevel', () => {
  it('rush hour is busier than deep night; metro closed at night', () => {
    const rush = activityLevel(8.5 * 60)
    const deep = activityLevel(3 * 60)
    expect(rush.pedestrians).toBeGreaterThan(deep.pedestrians * 3)
    expect(rush.traffic).toBeGreaterThan(deep.traffic * 2)
    expect(deep.transit).toBeLessThan(0.2)
    expect(rush.transit).toBeGreaterThan(0.8)
    expect(deep.phase).toBe('deep-night')
  })
  it('changes smoothly minute to minute and stays in 0..1', () => {
    let prev = activityLevel(0)
    for (let m = 1; m <= 1440; m++) {
      const cur = activityLevel(m)
      for (const k of ['pedestrians', 'traffic', 'overall'] as const) {
        expect(cur[k]).toBeGreaterThanOrEqual(0)
        expect(cur[k]).toBeLessThanOrEqual(1)
        expect(Math.abs(cur[k] - prev[k]), `${k} @${m}`).toBeLessThan(0.03)
      }
      prev = cur
    }
  })
  it('rain keeps people indoors', () => {
    expect(activityLevel(13 * 60, { weather: 'heavy-rain' }).pedestrians).toBeLessThan(
      activityLevel(13 * 60, { weather: 'clear' }).pedestrians,
    )
  })
})
