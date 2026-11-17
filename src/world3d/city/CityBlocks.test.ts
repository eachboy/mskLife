// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildCityGeometry } from './CityBlocks'
import { parseCityTile } from './cityTiles'

// Типов node в проекте нет: модуль грузим через переменную (как в cityTiles.test.ts).
interface NodeFs {
  readFileSync(path: URL): Uint8Array & { buffer: ArrayBuffer; byteOffset: number }
}
const fsName = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as NodeFs
const file = readFileSync(new URL('../../../public/city/tverskaya.bin', import.meta.url))
const tile = parseCityTile(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))

describe('buildCityGeometry', () => {
  const g = buildCityGeometry(tile)
  it('число вершин и индексов совпадает с разбором', () => {
    expect(g.getAttribute('position').count).toBe(tile.vertexCount)
    expect(g.getIndex()?.count).toBe(tile.indexCount)
  })
  it('атрибуты тайла и нормали заданы', () => {
    for (const n of ['aUv', 'aHeight', 'aSeed', 'aKind', 'normal']) {
      expect(g.getAttribute(n).count).toBe(tile.vertexCount)
    }
  })
  it('вершинного цвета нет: цвет считает фасадный шейдер', () => {
    expect(g.getAttribute('color')).toBeUndefined()
  })
  it('bounding box конечен', () => {
    const b = g.boundingBox
    expect(b).not.toBeNull()
    for (const v of [b?.min.x, b?.min.y, b?.min.z, b?.max.x, b?.max.y, b?.max.z]) expect(Number.isFinite(v)).toBe(true)
    expect(g.boundingSphere?.radius).toBeGreaterThan(0)
  })
})
