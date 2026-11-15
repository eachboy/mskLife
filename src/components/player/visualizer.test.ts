import { describe, expect, it } from 'vitest'
import { bandLevels, logBands } from './Visualizer'

describe('visualizer bands', () => {
  it('logBands covers range monotonically', () => {
    const b = logBands(6, 50, 12000)
    expect(b).toHaveLength(6)
    expect(b[0][0]).toBeCloseTo(50)
    expect(b[5][1]).toBeCloseTo(12000)
    for (let i = 1; i < b.length; i++) expect(b[i][0]).toBeCloseTo(b[i - 1][1])
  })

  it('silence gives zeros, a 1 kHz peak lights only its band', () => {
    const sr = 48000
    const db = new Float32Array(1024).fill(-Infinity)
    const bands = logBands(6)
    expect(bandLevels(db, sr, bands).every((v) => v === 0)).toBe(true)
    const bin = Math.round(1000 / (sr / 2 / db.length))
    db.fill(-120)
    db[bin] = -25
    const lv = bandLevels(db, sr, bands)
    const hit = bands.findIndex(([lo, hi]) => 1000 >= lo && 1000 < hi)
    expect(lv[hit]).toBeGreaterThan(0.9)
    for (let i = 0; i < lv.length; i++) if (i !== hit) expect(lv[i]).toBe(0)
  })
})
