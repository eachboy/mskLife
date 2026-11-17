/**
 * Поле расстояний до стен домов (чистые функции, без three) и его общая загрузка для района.
 * Строится один раз из тайла (кусками по 8 мс — бюджет Плана §4: кадр ≤ 50 мс) и делится между Ground (тротуар)
 * и Lamps (расстановка фонарей по кромке тротуара). Кэш — только на последний район.
 */
import { type CityTile, parseCityTile } from './cityTiles'

/** Ширина тротуарной полосы от стены дома, м. */
export const SIDEWALK_M = 3.5
/** Дальность поля расстояний, м (дальше — «далеко от домов»). */
export const DF_MAX_M = 8
/** Размер текстуры поля расстояний, px (768² = 0.6 МБ, шаг ≈ 1.9 м при районе 1400 м; 1024 не укладывается в 50 мс). */
export const DF_SIZE = 768

// ───────── Поле расстояний до стен (чистая функция) ─────────
export interface DistanceField {
  /** R8: 0 у стены … 255 = DF_MAX_M и дальше. Строка j — вдоль +Z от minZ. */
  data: Uint8Array
  size: number
  /** Левый нижний угол карты в координатах тайла (центр района = 0), м. */
  minX: number
  minZ: number
  /** Сторона карты, м. */
  extent: number
}

type FieldTile = Pick<CityTile, 'positions' | 'buildingVertexStart' | 'bbox' | 'center' | 'buildingCount'>

/**
 * Расстояние от каждой ячейки до ближайшего основания стены. Стены здания лежат после вершин крыши:
 * на ребро 4 вершины (b0, b1, t1, t0), основание — b0→b1 (см. cityTiles.ts).
 */
export function buildDistanceField(tile: FieldTile, size: number = DF_SIZE): DistanceField {
  const b = createDistanceBuilder(tile, size)
  b.run(Number.POSITIVE_INFINITY)
  return b.finish()
}

export interface DistanceBuilder {
  /** Обрабатывает здания, пока не истёк бюджет `ms` (мс); true — все здания пройдены. */
  run(ms: number): boolean
  finish(): DistanceField
}

/** Тот же расчёт, но по кускам: в загрузке района ни один кадр не получает больше `ms` мс (бюджет Плана — 50). */
export function createDistanceBuilder(tile: FieldTile, size: number = DF_SIZE): DistanceBuilder {
  const { bbox, center, positions, buildingVertexStart: bvs } = tile
  const minX = bbox.minX - center.x - DF_MAX_M
  const minZ = bbox.minZ - center.z - DF_MAX_M
  const extent = Math.max(bbox.maxX - bbox.minX, bbox.maxZ - bbox.minZ) + 2 * DF_MAX_M
  const cell = extent / size
  const best = new Float32Array(size * size).fill(DF_MAX_M * DF_MAX_M)
  const reach = Math.ceil(DF_MAX_M / cell) + 1
  let next = 0
  const run = (ms: number): boolean => {
    const t0 = performance.now()
    while (next < tile.buildingCount) {
      if (performance.now() - t0 >= ms) return false
      const end = Math.min(tile.buildingCount, next + 16)
      for (let b = next; b < end; b++) addBuilding(b)
      next = end
    }
    return true
  }
  const addBuilding = (b: number): void => {
    const vs = bvs[b]
    const ve = bvs[b + 1]
    const roof = (ve - vs) / 5
    for (let v = vs + roof; v + 3 < ve; v += 4) {
      const ax = positions[v * 3]
      const az = positions[v * 3 + 2]
      const bx = positions[(v + 1) * 3]
      const bz = positions[(v + 1) * 3 + 2]
      const dx = bx - ax
      const dz = bz - az
      const len2 = dx * dx + dz * dz
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - minX) / cell) - reach)
      const i1 = Math.min(size - 1, Math.floor((Math.max(ax, bx) - minX) / cell) + reach)
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - minZ) / cell) - reach)
      const j1 = Math.min(size - 1, Math.floor((Math.max(az, bz) - minZ) / cell) + reach)
      const inv2 = len2 > 1e-9 ? 1 / len2 : 0
      const reachM = DF_MAX_M + cell
      for (let j = j0; j <= j1; j++) {
        const pz = minZ + (j + 0.5) * cell
        // Кусок отрезка внутри полосы |z − pz| ≤ reachM → диапазон x ячеек строки (для диагоналей это сильно уже bbox).
        let tLo = 0
        let tHi = 1
        if (Math.abs(dz) > 1e-9) {
          const t1 = (pz - reachM - az) / dz
          const t2 = (pz + reachM - az) / dz
          tLo = Math.max(0, Math.min(t1, t2))
          tHi = Math.min(1, Math.max(t1, t2))
          if (tLo > tHi) continue
        } else if (Math.abs(az - pz) > reachM) continue
        const xa = ax + dx * tLo
        const xb = ax + dx * tHi
        const ri0 = Math.max(i0, Math.floor((Math.min(xa, xb) - minX - DF_MAX_M) / cell) - 1)
        const ri1 = Math.min(i1, Math.floor((Math.max(xa, xb) - minX + DF_MAX_M) / cell) + 1)
        for (let i = ri0; i <= ri1; i++) {
          const px = minX + (i + 0.5) * cell
          const t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) * inv2))
          const ex = px - (ax + dx * t)
          const ez = pz - (az + dz * t)
          const d2 = ex * ex + ez * ez
          if (d2 < best[j * size + i]) best[j * size + i] = d2
        }
      }
    }
  }
  const finish = (): DistanceField => {
    const data = new Uint8Array(size * size)
    for (let k = 0; k < data.length; k++) data[k] = Math.round((Math.sqrt(best[k]) / DF_MAX_M) * 255)
    return { data, size, minX, minZ, extent }
  }
  return { run, finish }
}

/** Расстояние до стены в метрах из значения поля (для тестов и отладки). */
export const fieldMeters = (q: number): number => (q / 255) * DF_MAX_M

let cached: { district: string; promise: Promise<DistanceField> } | null = null

/** Общее поле района: один fetch и один расчёт на район; повторные вызовы получают тот же Promise. */
export function loadDistanceField(district: string): Promise<DistanceField> {
  if (cached && cached.district === district) return cached.promise
  const promise = fetch(`/city/${district}.bin`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.arrayBuffer()
    })
    .then(async (buf) => {
      const builder = createDistanceBuilder(parseCityTile(buf))
      while (!builder.run(8)) await new Promise<void>((r) => setTimeout(r, 0))
      return builder.finish()
    })
  const entry = { district, promise }
  cached = entry
  // неудача не кэшируется: следующий вызов попробует снова
  promise.catch(() => {
    if (cached === entry) cached = null
  })
  return promise
}
