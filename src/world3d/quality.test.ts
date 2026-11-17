import { describe, expect, it } from 'vitest'
import { MAX_FRAME_DT } from '../utils/pageVisibility'
import { advanceWorldTime, frameloopFor, stepDelta, WORLD_TIME_PERIOD } from './frame'
import {
  BUDGET_FPS,
  initialAutoQuality,
  QUALITY_ORDER,
  type QualitySettings,
  qualitySettings,
  stepAutoQuality,
} from './quality'

const hi = qualitySettings('high')
const med = qualitySettings('medium')
const lo = qualitySettings('low')

describe('qualitySettings', () => {
  it('возвращает один и тот же замороженный объект', () => {
    for (const l of QUALITY_ORDER) {
      expect(qualitySettings(l)).toBe(qualitySettings(l))
      expect(Object.isFrozen(qualitySettings(l))).toBe(true)
      expect(qualitySettings(l).level).toBe(l)
    }
    expect(hi).not.toBe(med)
    expect(med).not.toBe(lo)
  })

  it('значения совпадают с Планом §5-§7', () => {
    expect([hi.dprMax, med.dprMax, lo.dprMax]).toEqual([1.5, 1.25, 1])
    expect([hi.shadowCascades, med.shadowCascades, lo.shadowCascades]).toEqual([3, 1, 0])
    expect([hi.shadowMapSize, med.shadowMapSize, lo.shadowMapSize]).toEqual([2048, 2048, 0])
    expect([hi.shadowRadiusM, med.shadowRadiusM, lo.shadowRadiusM]).toEqual([600, 250, 0])
    expect([hi.aoResolutionScale, med.aoResolutionScale, lo.aoResolutionScale]).toEqual([1, 0.5, 0])
    expect([hi.bloomLevels, lo.bloomLevels]).toEqual([5, 3])
    expect([hi.depthOfField, med.depthOfField, lo.depthOfField]).toEqual([true, false, false])
    expect([hi.roadReflections, med.roadReflections, lo.roadReflections]).toEqual([true, true, false])
    expect([hi.volumetricClouds, med.volumetricClouds, lo.volumetricClouds]).toEqual([true, false, false])
    expect([hi.precipitationMax, med.precipitationMax, lo.precipitationMax]).toEqual([8000, 5000, 3000])
    expect([hi.crowdMax, med.crowdMax, lo.crowdMax]).toEqual([40, 24, 12])
    expect(hi.pointLightsMax).toBe(8)
  })

  it('монотонно: Low <= Medium <= High по каждому числовому/булеву параметру', () => {
    const keys = Object.keys(hi) as (keyof QualitySettings)[]
    for (const k of keys) {
      if (k === 'level') continue
      const v = (s: QualitySettings): number | null => {
        const x = s[k]
        return typeof x === 'boolean' ? Number(x) : (x as number | null)
      }
      const [h, m, l] = [v(hi), v(med), v(lo)]
      if (m !== null && h !== null) expect(m, k).toBeLessThanOrEqual(h)
      if (l !== null && m !== null) expect(l, k).toBeLessThanOrEqual(m)
      if (l !== null && h !== null) expect(l, k).toBeLessThanOrEqual(h)
    }
  })

  it('приёмочные FPS из §9', () => {
    expect(BUDGET_FPS).toEqual({ high: 50, medium: 55, low: 30 })
  })
})

describe('stepAutoQuality', () => {
  it('медиана < 40 в течение 5 с -> на один уровень вниз (High)', () => {
    let s = initialAutoQuality('high', 0)
    s = stepAutoQuality(s, 39, 1000)
    s = stepAutoQuality(s, 39, 5999)
    expect(s.level).toBe('high')
    s = stepAutoQuality(s, 39, 6000)
    expect(s.level).toBe('medium')
    expect(s.belowSinceMs).toBeNull()
  })

  it('45 FPS не понижает (порог переключения 40, не приёмочные 50/55)', () => {
    let s = initialAutoQuality('medium', 0)
    for (let t = 0; t <= 20000; t += 1000) s = stepAutoQuality(s, 45, t)
    expect(s.level).toBe('medium')
  })

  it('кратковременная просадка сбрасывает отсчёт', () => {
    let s = initialAutoQuality('high', 0)
    s = stepAutoQuality(s, 30, 1000)
    s = stepAutoQuality(s, 60, 3000)
    s = stepAutoQuality(s, 30, 4000)
    s = stepAutoQuality(s, 30, 8000)
    expect(s.level).toBe('high')
    s = stepAutoQuality(s, 30, 9000)
    expect(s.level).toBe('medium')
  })

  it('ниже Low не идёт', () => {
    let s = initialAutoQuality('low', 0)
    for (let t = 1000; t <= 60000; t += 1000) s = stepAutoQuality(s, 5, t)
    expect(s.level).toBe('low')
  })

  it('два понижения подряд — по одному уровню, каждое с новым окном 5 с', () => {
    let s = initialAutoQuality('high', 0)
    s = stepAutoQuality(s, 10, 0)
    s = stepAutoQuality(s, 10, 5000)
    expect(s.level).toBe('medium')
    s = stepAutoQuality(s, 10, 5001)
    expect(s.level).toBe('medium')
    s = stepAutoQuality(s, 10, 10001)
    expect(s.level).toBe('low')
  })

  it('повышение: медиана ≥ 55 непрерывно 30 с; просадка ниже 55 сбрасывает окно', () => {
    let s = initialAutoQuality('medium', 0)
    s = stepAutoQuality(s, 60, 1000)
    s = stepAutoQuality(s, 60, 30999)
    expect(s.level).toBe('medium')
    s = stepAutoQuality(s, 60, 31000)
    expect(s.level).toBe('high')
    let r = initialAutoQuality('low', 0)
    r = stepAutoQuality(r, 60, 1000)
    r = stepAutoQuality(r, 54, 20000)
    r = stepAutoQuality(r, 60, 21000)
    r = stepAutoQuality(r, 60, 50999)
    expect(r.level).toBe('low')
    r = stepAutoQuality(r, 60, 51000)
    expect(r.level).toBe('medium')
  })

  it('после смены повышение не раньше 30 с, потолок соблюдается', () => {
    let s = initialAutoQuality('high', 0)
    s = stepAutoQuality(s, 10, 0)
    s = stepAutoQuality(s, 10, 5000)
    expect(s.level).toBe('medium')
    s = stepAutoQuality(s, 60, 6000)
    s = stepAutoQuality(s, 60, 34999)
    expect(s.level).toBe('medium')
    s = stepAutoQuality(s, 60, 36000)
    expect(s.level).toBe('high')
    let c = initialAutoQuality('medium', 0)
    for (let t = 1000; t <= 120000; t += 1000) c = stepAutoQuality(c, 120, t, 'medium')
    expect(c.level).toBe('medium')
  })
})

describe('frame', () => {
  it('stepDelta зажимает шаг до 0.1 с', () => {
    expect(stepDelta(3600)).toBe(MAX_FRAME_DT)
    expect(stepDelta(0.016)).toBe(0.016)
    expect(stepDelta(-1)).toBe(0)
    expect(stepDelta(Number.NaN)).toBe(0)
  })

  it('advanceWorldTime заворачивает период и остаётся в [0, period)', () => {
    let t = 0
    for (let i = 0; i < 100000; i++) t = advanceWorldTime(t, 0.1, 10)
    expect(t).toBeGreaterThanOrEqual(0)
    expect(t).toBeLessThan(10)
    expect(advanceWorldTime(WORLD_TIME_PERIOD - 0.05, 1)).toBeCloseTo(0.0, 0)
    expect(advanceWorldTime(5, 1000, 10)).toBeCloseTo(5.1, 10)
  })

  it('frameloopFor: скрыта -> never', () => {
    expect(frameloopFor(true)).toBe('never')
    expect(frameloopFor(false)).toBe('always')
  })
})
