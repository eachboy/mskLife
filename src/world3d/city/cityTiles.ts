/**
 * Разбор бинарного тайла района (План §4) в типизированные массивы. Без three.
 * Формат (версия 2) записывает scripts/city-bake.mjs; описание блоков — в шапке этого скрипта.
 * В файле только плоские контуры зданий и индексы крыш; вершины и индексы стен, uv и нормали-порядок
 * вершин строятся здесь по шаблону: на ребро 4 вершины (b0, b1, t1, t0) и 6 индексов.
 */

export const TILE_MAGIC = 'MLC1'
export const TILE_VERSION = 2
export const TILE_HEADER_BYTES = 48
/** Шаг квантования позиций, м. */
export const TILE_STEP = 0.1

export interface TileBBox {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  maxY: number
}

export interface CityTile {
  version: number
  vertexCount: number
  indexCount: number
  buildingCount: number
  /** Мировые координаты, м (x — восток, −z — север). */
  bbox: TileBBox
  /** Центр тайла в мировых координатах, м. */
  center: { x: number; z: number }
  /** x,y,z на вершину, м, относительно центра тайла. */
  positions: Float32Array
  /** Метры вдоль фасада и по высоте (стена); x,z относительно центра (крыша). */
  uvs: Float32Array
  /** Высота дома, м. */
  aHeight: Float32Array
  /** Хэш id, нормирован в 0..1. */
  aSeed: Float32Array
  /** 0 жилой, 1 офис, 2 исторический, 3 стекло. */
  aKind: Float32Array
  indices: Uint32Array
  /** Первая вершина каждого здания, длина buildingCount + 1. Вершины здания: крыша (P), затем стены (4 на ребро). */
  buildingVertexStart: Uint32Array
  /** Число колец здания (1 — без дворов). */
  buildingRings: Uint8Array
  /** Время сборки массивов из байтов файла, мс. */
  buildTimeMs: number
}

const fail = (msg: string): never => {
  throw new Error(`cityTile: ${msg}`)
}

export function parseCityTile(data: ArrayBuffer): CityTile {
  const t0 = performance.now()
  if (data.byteLength < TILE_HEADER_BYTES) fail('файл короче заголовка')
  const dv = new DataView(data)
  let magic = ''
  for (let i = 0; i < 4; i++) magic += String.fromCharCode(dv.getUint8(i))
  if (magic !== TILE_MAGIC) fail(`неверная магия "${magic}"`)
  const version = dv.getUint32(4, true)
  if (version !== TILE_VERSION) fail(`версия ${version} не поддерживается`)
  const V = dv.getUint32(8, true)
  const I = dv.getUint32(12, true)
  const bbox: TileBBox = {
    minX: dv.getFloat32(16, true),
    maxX: dv.getFloat32(20, true),
    minZ: dv.getFloat32(24, true),
    maxZ: dv.getFloat32(28, true),
    maxY: dv.getFloat32(32, true),
  }
  const center = { x: dv.getFloat32(36, true), z: dv.getFloat32(40, true) }
  const B = dv.getUint32(44, true)
  const len = data.byteLength

  let o = TILE_HEADER_BYTES
  const need = (n: number): void => {
    if (o + n > len) fail('файл обрезан')
  }

  // блоки по зданию
  need(B * 8)
  const rings = new Uint8Array(B)
  let R = 0
  for (let i = 0; i < B; i++, o++) {
    rings[i] = dv.getUint8(o)
    if (rings[i] < 1) fail('здание без колец')
    R += rings[i]
  }
  const roofCount = new Uint16Array(B)
  let T = 0
  for (let i = 0; i < B; i++, o += 2) {
    roofCount[i] = dv.getUint16(o, true)
    if (roofCount[i] < 3 || roofCount[i] % 3 !== 0) fail('число индексов крыши не кратно 3')
    T += roofCount[i]
  }
  const heights = new Uint16Array(B)
  for (let i = 0; i < B; i++, o += 2) heights[i] = dv.getUint16(o, true)
  const seeds = new Uint16Array(B)
  for (let i = 0; i < B; i++, o += 2) seeds[i] = dv.getUint16(o, true)
  const kinds = new Uint8Array(B)
  for (let i = 0; i < B; i++, o++) {
    kinds[i] = dv.getUint8(o)
    if (kinds[i] > 3) fail('неизвестный вид здания')
  }

  need(R * 2)
  const ringLen = new Uint16Array(R)
  let P = 0
  for (let i = 0; i < R; i++, o += 2) {
    ringLen[i] = dv.getUint16(o, true)
    if (ringLen[i] < 3) fail('кольцо короче 3 точек')
    P += ringLen[i]
  }
  if (V !== P * 5) fail('число вершин в заголовке не совпадает с контурами')
  if (I !== T + P * 6) fail('число индексов в заголовке не совпадает с контурами')

  need(P * 4 + T * 2)
  // координаты хранятся дельтами к предыдущей точке потока
  const qx = new Int32Array(P)
  let acc = 0
  for (let i = 0; i < P; i++, o += 2) {
    acc += dv.getInt16(o, true)
    qx[i] = acc
  }
  const qz = new Int32Array(P)
  acc = 0
  for (let i = 0; i < P; i++, o += 2) {
    acc += dv.getInt16(o, true)
    qz[i] = acc
  }
  const roofStart = o
  o += T * 2
  if (o !== len) fail('размер файла не совпадает с заголовком')

  const positions = new Float32Array(V * 3)
  const uvs = new Float32Array(V * 2)
  const aHeight = new Float32Array(V)
  const aSeed = new Float32Array(V)
  const aKind = new Float32Array(V)
  const indices = new Uint32Array(I)
  const buildingVertexStart = new Uint32Array(B + 1)

  let r = 0 // номер кольца
  let pt = 0 // первая точка здания
  let vs = 0 // текущая вершина
  let ix = 0 // текущий индекс
  let rp = roofStart
  for (let b = 0; b < B; b++) {
    buildingVertexStart[b] = vs
    const nr = rings[b]
    let pb = 0
    for (let k = 0; k < nr; k++) pb += ringLen[r + k]
    const h = heights[b] * TILE_STEP
    const seed = seeds[b] / 65535
    const kind = kinds[b]
    const vEnd = vs + pb * 5
    for (let v = vs; v < vEnd; v++) {
      aHeight[v] = h
      aSeed[v] = seed
      aKind[v] = kind
    }
    // крыша
    for (let k = 0; k < pb; k++) {
      const x = qx[pt + k] * TILE_STEP
      const z = qz[pt + k] * TILE_STEP
      const v = vs + k
      positions[v * 3] = x
      positions[v * 3 + 1] = h
      positions[v * 3 + 2] = z
      uvs[v * 2] = x
      uvs[v * 2 + 1] = z
    }
    for (let k = 0, n = roofCount[b]; k < n; k++, rp += 2) {
      const idx = dv.getUint16(rp, true)
      if (idx >= pb) fail('индекс крыши вне контура')
      indices[ix++] = vs + idx
    }
    // стены
    let wv = vs + pb
    let ringStart = pt
    for (let k = 0; k < nr; k++) {
      const n = ringLen[r + k]
      let along = 0
      for (let i = 0; i < n; i++) {
        const a = ringStart + i
        const c = ringStart + (i + 1 === n ? 0 : i + 1)
        const px = qx[a] * TILE_STEP
        const pz = qz[a] * TILE_STEP
        const nx = qx[c] * TILE_STEP
        const nz = qz[c] * TILE_STEP
        const u0 = along
        along += Math.sqrt((nx - px) * (nx - px) + (nz - pz) * (nz - pz))
        const b0 = wv
        const b1 = wv + 1
        const t1 = wv + 2
        const t0 = wv + 3
        positions[b0 * 3] = px
        positions[b0 * 3 + 2] = pz
        positions[b1 * 3] = nx
        positions[b1 * 3 + 2] = nz
        positions[t1 * 3] = nx
        positions[t1 * 3 + 1] = h
        positions[t1 * 3 + 2] = nz
        positions[t0 * 3] = px
        positions[t0 * 3 + 1] = h
        positions[t0 * 3 + 2] = pz
        uvs[b0 * 2] = u0
        uvs[b1 * 2] = along
        uvs[t1 * 2] = along
        uvs[t1 * 2 + 1] = h
        uvs[t0 * 2] = u0
        uvs[t0 * 2 + 1] = h
        // (b0,t1,b1),(b0,t0,t1): нормаль наружу при внешнем кольце против часовой (x,z)
        indices[ix++] = b0
        indices[ix++] = t1
        indices[ix++] = b1
        indices[ix++] = b0
        indices[ix++] = t0
        indices[ix++] = t1
        wv += 4
      }
      ringStart += n
    }
    vs = vEnd
    pt += pb
    r += nr
  }
  buildingVertexStart[B] = vs

  return {
    version,
    vertexCount: V,
    indexCount: I,
    buildingCount: B,
    bbox,
    center,
    positions,
    uvs,
    aHeight,
    aSeed,
    aKind,
    indices,
    buildingVertexStart,
    buildingRings: rings,
    buildTimeMs: performance.now() - t0,
  }
}
