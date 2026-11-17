// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildDistanceField, DF_MAX_M } from './distanceField'
import { parseCityTile } from './cityTiles'
import {
  fadeWeight,
  LAMP_BAND_MAX_M,
  LAMP_BAND_MIN_M,
  LAMP_MAX,
  LAMP_MIN_SPACING_M,
  LAMP_STRIDE,
  makeNearest,
  outsideMask,
  placeLamps,
  selectNearest,
} from './lampField'

interface NodeFs {
  readFileSync(path: URL): Uint8Array & { buffer: ArrayBuffer; byteOffset: number }
}
const fsName = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as NodeFs
const file = readFileSync(new URL('../../../public/city/tverskaya.bin', import.meta.url))
const tile = parseCityTile(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
const field = buildDistanceField(tile)

describe('placeLamps', () => {
  const tm = performance.now()
  const mask = outsideMask(field)
  const msMask = performance.now() - tm
  const t0 = performance.now()
  const lamps = placeLamps(field, undefined, undefined, mask)
  const ms = performance.now() - t0
  const n = lamps.length / LAMP_STRIDE

  it('детерминирован: тот же seed — те же фонари', () => {
    const again = placeLamps(field)
    expect(again.length).toBe(lamps.length)
    expect(Array.from(again.subarray(0, 64))).toEqual(Array.from(lamps.subarray(0, 64)))
  })

  it('на районе есть фонари, не больше потолка; каждый из двух шагов расстановки < 50 мс', () => {
    expect(n).toBeGreaterThan(100)
    expect(n).toBeLessThanOrEqual(LAMP_MAX)
    expect(ms).toBeLessThan(50)
    expect(msMask).toBeLessThan(50)
  })

  it('каждый фонарь стоит в полосе тротуара, рука — единичный вектор', () => {
    let bad = 0
    for (let i = 0; i < n; i++) {
      const x = lamps[i * LAMP_STRIDE]
      const z = lamps[i * LAMP_STRIDE + 1]
      const gi = Math.floor(((x - field.minX) / field.extent) * field.size)
      const gj = Math.floor(((z - field.minZ) / field.extent) * field.size)
      const d = (field.data[gj * field.size + gi] / 255) * DF_MAX_M
      const len = Math.hypot(lamps[i * LAMP_STRIDE + 2], lamps[i * LAMP_STRIDE + 3])
      if (d < LAMP_BAND_MIN_M - 0.2 || d > LAMP_BAND_MAX_M + 0.2 || Math.abs(len - 1) > 1e-3) bad++
    }
    expect(bad).toBe(0)
  })

  it('фонари не ближе минимального расстояния друг к другу и стоят «снаружи»', () => {
    const mask = outsideMask(field)
    let close = 0
    let inside = 0
    for (let i = 0; i < n; i++) {
      const x = lamps[i * LAMP_STRIDE]
      const z = lamps[i * LAMP_STRIDE + 1]
      const gi = Math.floor(((x - field.minX) / field.extent) * field.size)
      const gj = Math.floor(((z - field.minZ) / field.extent) * field.size)
      if (mask[gj * field.size + gi] !== 1) inside++
      for (let j = i + 1; j < n; j++) {
        if (Math.hypot(lamps[j * LAMP_STRIDE] - x, lamps[j * LAMP_STRIDE + 1] - z) < LAMP_MIN_SPACING_M - 1e-3) close++
      }
    }
    expect(close).toBe(0)
    expect(inside).toBe(0)
  })
})

describe('selectNearest / fadeWeight', () => {
  const lamps = new Float32Array([10, 0, 1, 0, -20, 0, 1, 0, 5, 5, 1, 0, 40, 40, 1, 0, 0, -3, 1, 0])
  it('отдаёт k ближайших по возрастанию расстояния', () => {
    const set = makeNearest(3)
    selectNearest(lamps, 0, 0, set)
    expect(set.n).toBe(3)
    expect(Array.from(set.idx)).toEqual([4, 2, 0])
    expect(set.d2[0]).toBeLessThanOrEqual(set.d2[1])
    expect(set.d2[1]).toBeLessThanOrEqual(set.d2[2])
  })

  it('вес k-го падает до нуля к расстоянию первого невыбранного (смена состава без скачка)', () => {
    const set = makeNearest(4)
    selectNearest(lamps, 0, 0, set)
    expect(fadeWeight(set, 0, 3, 100)).toBe(1)
    set.d2[3] = set.d2[2]
    expect(fadeWeight(set, 2, 3, 100)).toBeCloseTo(0, 6)
  })
})
