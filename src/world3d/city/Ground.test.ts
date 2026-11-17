// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseCityTile } from './cityTiles'
import { ASPHALT_LINEAR, buildDistanceField, createDistanceBuilder, DF_MAX_M, fieldMeters, SIDEWALK_M } from './Ground'

// Типов node в проекте нет: модуль грузим через переменную (как в CityBlocks.test.ts).
interface NodeFs {
  readFileSync(path: URL): Uint8Array & { buffer: ArrayBuffer; byteOffset: number }
}
const fsName = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as NodeFs
const file = readFileSync(new URL('../../../public/city/tverskaya.bin', import.meta.url))
const tile = parseCityTile(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))

describe('buildDistanceField', () => {
  // Район грузится кусками по 8 мс; бюджет кадра проверяем по самому долгому куску (+ финализация).
  const builder = createDistanceBuilder(tile)
  let ms = 0
  for (let done = false; !done; ) {
    const t = performance.now()
    done = builder.run(8)
    ms = Math.max(ms, performance.now() - t)
  }
  const t1 = performance.now()
  const f = builder.finish()
  ms = Math.max(ms, performance.now() - t1)
  const whole = buildDistanceField(tile)
  const at = (x: number, z: number): number => {
    const i = Math.floor(((x - f.minX) / f.extent) * f.size)
    const j = Math.floor(((z - f.minZ) / f.extent) * f.size)
    return fieldMeters(f.data[j * f.size + i])
  }

  it('карта охватывает тайл с запасом на дальность поля', () => {
    expect(f.data.length).toBe(f.size * f.size)
    expect(f.minX).toBeCloseTo(tile.bbox.minX - tile.center.x - DF_MAX_M, 3)
    expect(f.extent).toBeGreaterThan(tile.bbox.maxX - tile.bbox.minX)
  })

  it('на стене дома расстояние ≈ 0, в углу карты — «далеко»', () => {
    const v = tile.buildingVertexStart[0] + (tile.buildingVertexStart[1] - tile.buildingVertexStart[0]) / 5
    const wx = tile.positions[v * 3]
    const wz = tile.positions[v * 3 + 2]
    expect(at(wx, wz)).toBeLessThan(1.5)
    expect(f.data[0]).toBe(255)
  })

  it('есть и тротуар (≤ SIDEWALK_M), и далёкий асфальт (≥ 2·SIDEWALK_M)', () => {
    let near = 0
    let far = 0
    for (const q of f.data) {
      const d = fieldMeters(q)
      if (d <= SIDEWALK_M) near++
      else if (d >= 2 * SIDEWALK_M) far++
    }
    expect(near).toBeGreaterThan(1000)
    expect(far).toBeGreaterThan(1000)
  })

  it('сборка укладывается в бюджет кадра подгрузки (≤ 50 мс на кусок)', () => {
    expect(ms).toBeLessThan(50)
  })

  it('по кускам даёт то же поле, что за один проход', () => {
    expect(Array.from(whole.data)).toEqual(Array.from(f.data))
  })
})

describe('асфальт', () => {
  it('значения в диапазоне 0.04–0.12 (линейный RGB; тёмный асфальт убирает белёсый день)', () => {
    for (const c of ASPHALT_LINEAR) {
      expect(c).toBeGreaterThanOrEqual(0.04)
      expect(c).toBeLessThanOrEqual(0.12)
    }
  })
})
