// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DISTRICT_SIZE, districtBounds } from '../geo'
import { parseCityTile } from './cityTiles'

// Типов node в проекте нет (@types/node не установлен): модуль грузим через переменную, интерфейс — минимальный.
interface NodeFs {
  readFileSync(path: URL): Uint8Array & { buffer: ArrayBuffer; byteOffset: number }
}
const fsName = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as NodeFs
const bytes = readFileSync(new URL('../../../public/city/tverskaya.bin', import.meta.url))
const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
const meta = JSON.parse(
  new TextDecoder().decode(readFileSync(new URL('../../../public/city/index.json', import.meta.url))),
).districts.tverskaya

// Первый (холодный) разбор — самый строгий замер бюджета подгрузки.
const t0 = performance.now()
const tile = parseCityTile(data)
const coldParseMs = performance.now() - t0

/** Точка в многоугольнике (x,z) по вершинам крыши [from, from+n). */
function inRing(px: number, pz: number, pos: Float32Array, from: number, n: number): boolean {
  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = pos[(from + i) * 3]
    const az = pos[(from + i) * 3 + 2]
    const bx = pos[(from + j) * 3]
    const bz = pos[(from + j) * 3 + 2]
    if (az > pz !== bz > pz && px < ((bx - ax) * (pz - az)) / (bz - az) + ax) inside = !inside
  }
  return inside
}

describe('формат тайла района (версия 2)', () => {
  it('число вершин и индексов совпадает с заголовком и index.json', () => {
    expect(tile.version).toBe(2)
    expect(tile.vertexCount).toBe(meta.vertices)
    expect(tile.indexCount).toBe(meta.indices)
    expect(tile.buildingCount).toBe(meta.buildings)
    expect(tile.positions.length).toBe(tile.vertexCount * 3)
    expect(tile.uvs.length).toBe(tile.vertexCount * 2)
    expect(tile.aHeight.length).toBe(tile.vertexCount)
    expect(tile.aSeed.length).toBe(tile.vertexCount)
    expect(tile.aKind.length).toBe(tile.vertexCount)
    expect(tile.indices.length).toBe(tile.indexCount)
    expect(tile.indexCount % 3).toBe(0)
    expect(tile.buildingVertexStart[tile.buildingCount]).toBe(tile.vertexCount)
    expect(bytes.byteLength).toBe(meta.bytes)
  })

  it('вес gzip в index.json в лимите 350 КБ', () => {
    expect(meta.gzipBytes).toBeLessThanOrEqual(350 * 1024)
  })

  it('индексы в пределах вершин', () => {
    let max = 0
    for (const i of tile.indices) if (i > max) max = i
    expect(max).toBeLessThan(tile.vertexCount)
  })

  it('bbox внутри квадрата района 1400 м', () => {
    const b = districtBounds('tverskaya')
    const eps = 0.2
    expect(tile.bbox.maxX - tile.bbox.minX).toBeLessThanOrEqual(DISTRICT_SIZE + eps)
    expect(tile.bbox.maxZ - tile.bbox.minZ).toBeLessThanOrEqual(DISTRICT_SIZE + eps)
    expect(tile.bbox.minX).toBeGreaterThanOrEqual(b.minX - eps)
    expect(tile.bbox.maxX).toBeLessThanOrEqual(b.maxX + eps)
    expect(tile.bbox.minZ).toBeGreaterThanOrEqual(b.minZ - eps)
    expect(tile.bbox.maxZ).toBeLessThanOrEqual(b.maxZ + eps)
  })

  it('позиции согласованы с bbox, высоты и виды в допустимых границах', () => {
    let bad = 0
    for (let i = 0; i < tile.vertexCount; i++) {
      const x = tile.center.x + tile.positions[i * 3]
      const y = tile.positions[i * 3 + 1]
      const z = tile.center.z + tile.positions[i * 3 + 2]
      const ok =
        x >= tile.bbox.minX - 0.01 &&
        x <= tile.bbox.maxX + 0.01 &&
        z >= tile.bbox.minZ - 0.01 &&
        z <= tile.bbox.maxZ + 0.01 &&
        y >= 0 &&
        y <= tile.bbox.maxY + 0.01 &&
        tile.aKind[i] <= 3
      if (!ok) bad++
    }
    expect(bad).toBe(0)
  })

  it('треугольники крыш (три вершины на одной высоте >0) смотрят вверх', () => {
    const p = tile.positions
    let roofs = 0
    for (let t = 0; t < tile.indexCount; t += 3) {
      const a = tile.indices[t] * 3
      const b = tile.indices[t + 1] * 3
      const c = tile.indices[t + 2] * 3
      if (p[a + 1] > 0 && p[a + 1] === p[b + 1] && p[a + 1] === p[c + 1]) {
        roofs++
        // в целых шагах 0.1 м, как при запекании: float32-произведения дали бы шум на коллинеарных треугольниках
        const q = (i: number) => Math.round(p[i] / 0.1)
        const ny = (q(b + 2) - q(a + 2)) * (q(c) - q(a)) - (q(b) - q(a)) * (q(c + 2) - q(a + 2))
        expect(ny).toBeGreaterThanOrEqual(0)
      }
    }
    expect(roofs).toBeGreaterThan(0)
  })

  it('нормали стен (векторное произведение) смотрят наружу от тела здания', () => {
    const p = tile.positions
    let checkedBuildings = 0
    let checkedWalls = 0
    for (let b = 0; b < tile.buildingCount && checkedBuildings < 200; b++) {
      if (tile.buildingRings[b] !== 1) continue
      const start = tile.buildingVertexStart[b]
      const n = (tile.buildingVertexStart[b + 1] - start) / 5
      checkedBuildings++
      // стены здания: вершины после n вершин крыши, по 4 на ребро (b0, b1, t1, t0)
      for (let w = 0; w < n; w++) {
        const b0 = (start + n + w * 4) * 3
        const b1 = b0 + 3
        const t1 = b0 + 6
        // (b0,t1,b1): e1 = t1-b0, e2 = b1-b0, нормаль = e1 x e2
        const e1 = [p[t1] - p[b0], p[t1 + 1] - p[b0 + 1], p[t1 + 2] - p[b0 + 2]]
        const e2 = [p[b1] - p[b0], p[b1 + 1] - p[b0 + 1], p[b1 + 2] - p[b0 + 2]]
        const nx = e1[1] * e2[2] - e1[2] * e2[1]
        const nz = e1[0] * e2[1] - e1[1] * e2[0]
        const l = Math.hypot(nx, nz)
        if (l === 0) continue
        const mx = (p[b0] + p[b1]) / 2
        const mz = (p[b0 + 2] + p[b1 + 2]) / 2
        // точка на 2 см снаружи ребра должна лежать вне контура здания
        expect(inRing(mx + (nx / l) * 0.02, mz + (nz / l) * 0.02, p, start, n)).toBe(false)
        checkedWalls++
      }
    }
    expect(checkedBuildings).toBeGreaterThanOrEqual(100)
    expect(checkedWalls).toBeGreaterThan(500)
  })

  it('uv стены: x — длина вдоль ребра в метрах, y — высота в метрах', () => {
    const v = tile.buildingVertexStart[0]
    const n = (tile.buildingVertexStart[1] - v) / 5
    const b0 = v + n
    const len = Math.hypot(
      tile.positions[(b0 + 1) * 3] - tile.positions[b0 * 3],
      tile.positions[(b0 + 1) * 3 + 2] - tile.positions[b0 * 3 + 2],
    )
    expect(tile.uvs[b0 * 2]).toBe(0)
    expect(tile.uvs[b0 * 2 + 1]).toBe(0)
    expect(tile.uvs[(b0 + 1) * 2] - tile.uvs[b0 * 2]).toBeCloseTo(len, 4)
    expect(tile.uvs[(b0 + 2) * 2 + 1]).toBeCloseTo(tile.aHeight[b0], 4)
  })

  it('повторный разбор даёт те же числа', () => {
    const again = parseCityTile(data)
    expect(again.vertexCount).toBe(tile.vertexCount)
    expect(again.indexCount).toBe(tile.indexCount)
    expect(again.bbox).toEqual(tile.bbox)
    expect(again.indices).toEqual(tile.indices)
    expect(again.positions).toEqual(tile.positions)
    expect(again.uvs).toEqual(tile.uvs)
  })

  it('время parseCityTile на этом тайле не больше 50 мс (холодный вызов)', () => {
    console.log(`parseCityTile: холодный ${coldParseMs.toFixed(1)} мс, buildTimeMs ${tile.buildTimeMs.toFixed(1)} мс`)
    expect(tile.buildTimeMs).toBeLessThanOrEqual(50)
    expect(coldParseMs).toBeLessThanOrEqual(50)
    expect(parseCityTile(data).buildTimeMs).toBeLessThanOrEqual(50)
  })

  it('отвергает битый файл', () => {
    expect(() => parseCityTile(data.slice(0, 100))).toThrow()
    expect(() => parseCityTile(data.slice(0, data.byteLength - 2))).toThrow()
    expect(() => parseCityTile(new ArrayBuffer(48))).toThrow()
    const badVersion = data.slice(0)
    new DataView(badVersion).setUint32(4, 1, true)
    expect(() => parseCityTile(badVersion)).toThrow()
    const badCount = data.slice(0)
    new DataView(badCount).setUint32(8, tile.vertexCount + 1, true)
    expect(() => parseCityTile(badCount)).toThrow()
  })
})
