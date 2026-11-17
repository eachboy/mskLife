import { describe, expect, it } from 'vitest'
import { buildBolt, FLASH_DURATION_S, flashAmplitude, flashEnvelope } from './Lightning'

describe('flashEnvelope', () => {
  it('до удара и после конца — 0, в момент удара — 1', () => {
    expect(flashEnvelope(-0.1)).toBe(0)
    expect(flashEnvelope(FLASH_DURATION_S)).toBe(0)
    expect(flashEnvelope(0)).toBe(1)
  })
  it('между ударами провал, второй удар слабее первого', () => {
    const dip = flashEnvelope(0.12)
    const second = flashEnvelope(0.15)
    expect(dip).toBeLessThan(second)
    expect(second).toBeLessThan(1)
    expect(second).toBeGreaterThan(0.5)
  })
  it('значения в 0..1 по всей длительности', () => {
    for (let t = 0; t < FLASH_DURATION_S; t += 0.01) {
      const v = flashEnvelope(t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('flashAmplitude', () => {
  it('рядом ярче, чем далеко; границы 1 и 0.45', () => {
    expect(flashAmplitude(0)).toBeCloseTo(1, 6)
    expect(flashAmplitude(1)).toBeCloseTo(0.45, 6)
    expect(flashAmplitude(5)).toBeCloseTo(0.45, 6)
    expect(flashAmplitude(0.2)).toBeGreaterThan(flashAmplitude(0.6))
  })
})

describe('buildBolt', () => {
  it('детерминирован по seed и укладывается в единичную высоту', () => {
    const a = buildBolt(7)
    const b = buildBolt(7)
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(Array.from(buildBolt(8))).not.toEqual(Array.from(a))
    let top = 0
    for (let i = 1; i < a.length; i += 3) {
      expect(a[i]).toBeGreaterThanOrEqual(0)
      top = Math.max(top, a[i])
    }
    expect(top).toBe(1)
    expect(a.length % 6).toBe(0)
  })
})
