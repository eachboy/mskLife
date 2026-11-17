#!/usr/bin/env node
/**
 * Запекание района города из OpenStreetMap (План §4).
 * Запуск: node scripts/city-bake.mjs <district|far> [--refresh]
 *
 * Вход:  центр из src/data/locations.ts (lat/lng), квадрат 1400x1400 м.
 *        far — дальний город: круг 9 км вокруг начала координат, крупные здания вне районов героя, упрощённые.
 * Кэш:   assets/source/osm/<id>.json.gz (сырой ответ Overpass, gzip уровень 9; читается и несжатый <id>.json;
 *        --refresh скачивает заново). Дальний город — блоками: assets/source/osm/far/<ix>_<iz>.json.gz.
 * Выход: public/city/<district>.bin + запись в public/city/index.json (far.bin — в index.far).
 * Данные: (c) OpenStreetMap contributors, ODbL.
 *
 * Детерминизм: элементы сортируются по (тип, id), без Math.random и дат; одинаковый кэш -> одинаковый .bin.
 * В тайл пишутся только здания (формат Плана §4 описывает геометрию домов); дороги, вода, парки, деревья
 * остаются в сыром кэше и запекаются отдельным шагом.
 *
 * ФОРМАТ .bin (little-endian), версия 2: хранится только плоский контур зданий, меш строится при загрузке.
 * Разбор — src/world3d/city/cityTiles.ts.
 *   Заголовок 48 байт:
 *     0  u8[4] магия "MLC1"        4  u32 версия (=2)
 *     8  u32 число вершин V (контроль: считается при загрузке)   12 u32 число индексов I (контроль)
 *     16 f32 minX  20 f32 maxX  24 f32 minZ  28 f32 maxZ  32 f32 maxY   (мир, метры)
 *     36 f32 centerX  40 f32 centerZ   (центр тайла, мир, метры)
 *     44 u32 число зданий B
 *   Тело (блоки подряд, без выравнивания; R = сумма колец, P = сумма точек, T = сумма индексов крыш):
 *     Uint8  rings[B]      число колец здания (первое — внешнее, остальные — дворы)
 *     Uint16 roofCount[B]  число индексов крыши здания (кратно 3)
 *     Uint16 aHeight[B]    высота, шаг 0.1 м
 *     Uint16 aSeed[B]      16 бит FNV-1a от "<type>/<id>"
 *     Uint8  aKind[B]      0 жилой, 1 офис/коммерция, 2 исторический/культовый, 3 стекло
 *     Uint16 ringLen[R]    число точек кольца
 *     Int16  px[P]         X точек, шаг 0.1 м от центра тайла; хранится ДЕЛЬТА к предыдущей точке потока (первая — от 0)
 *     Int16  pz[P]         то же для Z
 *     Uint16 roof[T]       индексы earcut относительно первой точки здания; ориентация — нормаль вверх
 *   Контуры: внешнее кольцо против часовой (shoelace>0 в x,z), дворы по часовой; точки без повтора первой.
 *   Загрузка строит на здание: P вершин крыши, затем по 4 вершины на ребро (стены); индексов T + 6 на ребро.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import earcut from 'earcut'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OVERPASS = 'https://overpass-api.de/api/interpreter'
const USER_AGENT = 'osm-tile-baker/1.0'

// Дублирует src/world3d/geo.ts (План §4); изменение там требует правки здесь.
const LAT0 = 55.752
const LNG0 = 37.6175
const M_PER_DEG_LNG = Math.cos((LAT0 * Math.PI) / 180) * 111320
const M_PER_DEG_LAT = 110574
const DISTRICT_SIZE = 1400

const DEFAULT_HEIGHT = 16
const LEVEL_HEIGHT = 3.2
const MAX_HEIGHT = 400
const MAGIC = 'MLC1'
const VERSION = 2
const HEADER_BYTES = 48
const GZIP_LIMIT = 350 * 1024
const FAR_GZIP_LIMIT = 900 * 1024
const FAR_ID = 'far'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const toWorld = (lat, lng) => ({ x: (lng - LNG0) * M_PER_DEG_LNG, z: -(lat - LAT0) * M_PER_DEG_LAT })

function locationLatLng(id) {
  const src = readFileSync(resolve(ROOT, 'src/data/locations.ts'), 'utf8')
  const start = src.search(new RegExp(`^\\s*(?:'${id}'|${id}):\\s*\\{`, 'm'))
  if (start < 0) throw new Error(`Локация ${id} не найдена в src/data/locations.ts`)
  const m = /lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+)/.exec(src.slice(start, start + 600))
  if (!m) throw new Error(`Нет lat/lng у локации ${id}`)
  return { lat: Number(m[1]), lng: Number(m[2]) }
}

function districtBounds(id) {
  const { lat, lng } = locationLatLng(id)
  const c = toWorld(lat, lng)
  const h = DISTRICT_SIZE / 2
  return { minX: c.x - h, maxX: c.x + h, minZ: c.z - h, maxZ: c.z + h, center: c }
}

// ---------- Overpass ----------
function buildQuery(b) {
  const south = LAT0 - b.maxZ / M_PER_DEG_LAT
  const north = LAT0 - b.minZ / M_PER_DEG_LAT
  const west = LNG0 + b.minX / M_PER_DEG_LNG
  const east = LNG0 + b.maxX / M_PER_DEG_LNG
  const bb = [south, west, north, east].map((v) => v.toFixed(6)).join(',')
  return `[out:json][timeout:180];(way["building"](${bb});relation["building"](${bb});way["highway"](${bb});way["natural"="water"](${bb});way["waterway"="riverbank"](${bb});way["leisure"="park"](${bb});node["natural"="tree"](${bb}););out geom;`
}

async function download(query, retries = 2) {
  const maxAttempts = retries + 1
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(5000) // пауза >= 5 с перед каждым запросом
    try {
      const res = await fetch(OVERPASS, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      })
      if (res.ok) return await res.text()
      console.error(`Overpass: HTTP ${res.status} (попытка ${attempt}/${maxAttempts})`)
    } catch (e) {
      console.error(`Overpass: ${e.message} (попытка ${attempt}/${maxAttempts})`)
    }
    if (attempt < maxAttempts) await sleep(30000)
  }
  throw new Error(`Overpass не ответил за ${maxAttempts} попыток — стоп.`)
}

// ---------- кэш ----------
/** Читает <base>.json.gz, иначе <base>.json; null — кэша нет. */
function readCache(base) {
  if (existsSync(`${base}.json.gz`)) return gunzipSync(readFileSync(`${base}.json.gz`)).toString('utf8')
  if (existsSync(`${base}.json`)) return readFileSync(`${base}.json`, 'utf8')
  return null
}

/** Сохраняет сразу сжатым (gzip, уровень 9); возвращает размер в байтах. */
function saveCache(base, raw) {
  mkdirSync(dirname(base), { recursive: true })
  const gz = gzipSync(raw, { level: 9 })
  writeFileSync(`${base}.json.gz`, gz)
  return gz.length
}

// ---------- геометрия ----------
const shoelace = (ring) => {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    s += a.x * b.z - b.x * a.z
  }
  return s / 2
}

function cleanRing(pts) {
  const out = []
  for (const p of pts) {
    const q = out[out.length - 1]
    if (!q || Math.abs(q.x - p.x) > 1e-6 || Math.abs(q.z - p.z) > 1e-6) out.push(p)
  }
  while (
    out.length > 1 &&
    Math.abs(out[0].x - out[out.length - 1].x) < 1e-6 &&
    Math.abs(out[0].z - out[out.length - 1].z) < 1e-6
  )
    out.pop()
  return out
}

const orient = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)

function selfIntersects(ring) {
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % n]
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      const c = ring[j]
      const d = ring[(j + 1) % n]
      const o1 = orient(a, b, c)
      const o2 = orient(a, b, d)
      const o3 = orient(c, d, a)
      const o4 = orient(c, d, b)
      if (o1 * o2 < 0 && o3 * o4 < 0) return true
    }
  }
  return false
}

function pointInRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

const geomToRing = (geom) => geom.map((g) => toWorld(g.lat, g.lon))

/** Склейка незамкнутых отрезков мультиполигона в кольца (по совпадению концов). */
function joinWays(segments) {
  const rings = []
  const rest = segments.map((s) => s.slice())
  const same = (a, b) => a.lat === b.lat && a.lon === b.lon
  while (rest.length) {
    let cur = rest.shift()
    let grown = true
    while (grown && !same(cur[0], cur[cur.length - 1])) {
      grown = false
      for (let i = 0; i < rest.length; i++) {
        const s = rest[i]
        const end = cur[cur.length - 1]
        if (same(end, s[0])) cur = cur.concat(s.slice(1))
        else if (same(end, s[s.length - 1])) cur = cur.concat(s.slice(0, -1).reverse())
        else continue
        rest.splice(i, 1)
        grown = true
        break
      }
    }
    if (same(cur[0], cur[cur.length - 1]) && cur.length >= 4) rings.push(cur)
  }
  return rings
}

// ---------- атрибуты ----------
function parseMeters(v) {
  if (v == null) return null
  const m = /^\s*(-?\d+(?:[.,]\d+)?)/.exec(String(v))
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function buildingHeight(tags) {
  const h = parseMeters(tags.height)
  if (h != null) return { h: Math.min(h, MAX_HEIGHT), known: true }
  const lv = parseMeters(tags['building:levels'])
  if (lv != null) return { h: Math.min(lv * LEVEL_HEIGHT, MAX_HEIGHT), known: true }
  return { h: DEFAULT_HEIGHT, known: false }
}

const OFFICE = new Set([
  'office',
  'commercial',
  'retail',
  'hotel',
  'public',
  'civic',
  'government',
  'university',
  'supermarket',
  'industrial',
  'warehouse',
])
const HISTORIC = new Set([
  'church',
  'cathedral',
  'chapel',
  'monastery',
  'temple',
  'synagogue',
  'mosque',
  'castle',
  'palace',
])

function buildingKind(tags) {
  if (tags['building:material'] === 'glass' || tags['facade:material'] === 'glass') return 3
  if (tags.historic || HISTORIC.has(tags.building)) return 2
  if (OFFICE.has(tags.building) || tags.office) return 1
  return 0
}

function fnv16(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h ^ (h >>> 16)) & 0xffff
}

// ---------- сборка контуров ----------
class Plan {
  constructor() {
    this.rings = [] // u8 на здание
    this.roofCount = [] // u16 на здание
    this.height = []
    this.seed = []
    this.kind = []
    this.ringLen = []
    this.px = [] // абсолютные, шаг 0.1 м
    this.pz = []
    this.roof = []
    this.verts = 0
    this.idxs = 0
  }
}

const q10 = (v) => Math.round(v * 10)

/** Кольцо мировых метров -> целые шаги 0.1 м от центра; без повторов подряд; null если вырождено. */
function quantRing(ring, c) {
  const out = []
  for (const p of ring) {
    const x = q10(p.x - c.x)
    const z = q10(p.z - c.z)
    const q = out[out.length - 1]
    if (!q || q.x !== x || q.z !== z) out.push({ x, z })
  }
  while (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].z === out[out.length - 1].z) out.pop()
  return out.length >= 3 ? out : null
}

/** Добавляет здание в план. Возвращает null при успехе или причину отказа. outer/holes — метры мира. */
function addBuilding(plan, outerIn, holesIn, height, seed, kind, c) {
  let outer = quantRing(outerIn, c)
  // площадь >= 1 м^2 = 100 шагов^2; иначе контур вырожден после квантования
  if (!outer || Math.abs(shoelace(outer)) < 100) return 'degenerate'
  if (shoelace(outer) < 0) outer = outer.reverse()
  const holes = []
  for (const h of holesIn) {
    let r = quantRing(h, c)
    if (!r || Math.abs(shoelace(r)) < 100) continue // вырожденный двор отбрасывается
    if (shoelace(r) > 0) r = r.reverse()
    holes.push(r)
  }
  if (selfIntersects(outer) || holes.some(selfIntersects)) return 'selfIntersect'
  const rings = [outer, ...holes]
  const pts = rings.flat()
  if (pts.length > 21845 || rings.length > 255) return 'triFail'

  const flat = []
  const holeIdx = []
  let n = 0
  for (let r = 0; r < rings.length; r++) {
    if (r > 0) holeIdx.push(n)
    for (const p of rings[r]) {
      flat.push(p.x, p.z)
      n++
    }
  }
  const tris = earcut(flat, holeIdx.length ? holeIdx : undefined, 2)
  const roof = []
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i]
    let b = tris[i + 1]
    let d = tris[i + 2]
    // нормаль крыши вверх (+y): считаем в целых шагах, как в загрузчике
    const ny = (pts[b].z - pts[a].z) * (pts[d].x - pts[a].x) - (pts[b].x - pts[a].x) * (pts[d].z - pts[a].z)
    if (ny === 0) continue // нулевая площадь — невидима
    if (ny < 0) [b, d] = [d, b]
    roof.push(a, b, d)
  }
  if (roof.length < 3) return 'triFail'

  plan.rings.push(rings.length)
  plan.roofCount.push(roof.length)
  plan.height.push(Math.min(65535, q10(height)))
  plan.seed.push(seed)
  plan.kind.push(kind)
  for (const r of rings) plan.ringLen.push(r.length)
  for (const p of pts) {
    plan.px.push(p.x)
    plan.pz.push(p.z)
  }
  for (const v of roof) plan.roof.push(v)
  plan.verts += pts.length * 5
  plan.idxs += roof.length + pts.length * 6
  return null
}

// ---------- запись ----------
/** Кодирует план в буфер .bin (без записи на диск). */
function encodeTile(plan, c) {
  const B = plan.rings.length
  const V = plan.verts
  const I = plan.idxs
  const P = plan.px.length
  if (B === 0) throw new Error('Нет ни одного здания в тайле')
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < P; i++) {
    const x = c.x + plan.px[i] / 10
    const z = c.z + plan.pz[i] / 10
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  const maxY = Math.max(...plan.height) / 10

  const blocks = []
  const block = (name, bytesPer, values, write) => {
    const b = Buffer.alloc(values.length * bytesPer)
    let o = 0
    for (const v of values) {
      write(b, v, o)
      o += bytesPer
    }
    blocks.push({ name, buf: b })
  }
  const u8 = (b, v, o) => b.writeUInt8(v, o)
  const u16 = (b, v, o) => b.writeUInt16LE(v, o)
  const i16 = (b, v, o) => b.writeInt16LE(v, o) // бросает RangeError при выходе за Int16
  const delta = (arr) => arr.map((v, i) => v - (i ? arr[i - 1] : 0))
  block('rings u8[B]', 1, plan.rings, u8)
  block('roofCount u16[B]', 2, plan.roofCount, u16)
  block('aHeight u16[B]', 2, plan.height, u16)
  block('aSeed u16[B]', 2, plan.seed, u16)
  block('aKind u8[B]', 1, plan.kind, u8)
  block('ringLen u16[R]', 2, plan.ringLen, u16)
  block('px i16[P] (delta)', 2, delta(plan.px), i16)
  block('pz i16[P] (delta)', 2, delta(plan.pz), i16)
  block('roof u16[T]', 2, plan.roof, u16)

  const head = Buffer.alloc(HEADER_BYTES)
  head.write(MAGIC, 0, 'ascii')
  head.writeUInt32LE(VERSION, 4)
  head.writeUInt32LE(V, 8)
  head.writeUInt32LE(I, 12)
  head.writeFloatLE(minX, 16)
  head.writeFloatLE(maxX, 20)
  head.writeFloatLE(minZ, 24)
  head.writeFloatLE(maxZ, 28)
  head.writeFloatLE(maxY, 32)
  head.writeFloatLE(c.x, 36)
  head.writeFloatLE(c.z, 40)
  head.writeUInt32LE(B, 44)
  const buf = Buffer.concat([head, ...blocks.map((x) => x.buf)])
  return { B, V, I, buf, blocks, minX, maxX, minZ, maxZ, maxY }
}

/** Пишет .bin + запись в index.json, печатает числа блоков. */
function writeTile(plan, c, name, limit) {
  const { B, V, I, buf, blocks, minX, maxX, minZ, maxZ, maxY } = encodeTile(plan, c)
  const outDir = resolve(ROOT, 'public/city')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, `${name}.bin`), buf)
  const gz = gzipSync(buf, { level: 9 })
  const hash = createHash('sha256').update(buf).digest('hex')

  const indexFile = resolve(outDir, 'index.json')
  const index = existsSync(indexFile)
    ? JSON.parse(readFileSync(indexFile, 'utf8'))
    : { version: VERSION, districts: {} }
  index.version = VERSION
  const entry = {
    file: `${name}.bin`,
    bbox: { minX: round(minX), maxX: round(maxX), minZ: round(minZ), maxZ: round(maxZ), maxY: round(maxY) },
    center: { x: round(c.x), z: round(c.z) },
    buildings: B,
    vertices: V,
    indices: I,
    bytes: buf.length,
    gzipBytes: gz.length,
    sha256: hash,
  }
  if (name === FAR_ID) index.far = entry
  else index.districts[name] = entry
  index.districts = Object.fromEntries(Object.entries(index.districts).sort(([a], [b2]) => (a < b2 ? -1 : 1)))
  writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}
`)

  console.log(`Вершин: ${V}; индексов: ${I}; треугольников: ${I / 3}`)
  console.log(
    `Размер: ${buf.length} байт (${(buf.length / 1024).toFixed(1)} КБ); gzip: ${gz.length} байт (${(gz.length / 1024).toFixed(1)} КБ); лимит ${limit / 1024} КБ: ${gz.length <= limit ? 'в лимите' : 'ПРЕВЫШЕН'}`,
  )
  console.log('Блок · байт до gzip · байт после gzip')
  for (const bl of blocks) console.log(`  ${bl.name} · ${bl.buf.length} · ${gzipSync(bl.buf, { level: 9 }).length}`)
  console.log(`  заголовок · ${HEADER_BYTES}`)
  console.log(`sha256: ${hash}`)
  return { B, V, I, buf, gz }
}

// ---------- дальний город ----------
const FAR_RADIUS = 9000
const FAR_BLOCK = 3000
const FAR_TOLERANCE = 4 // допуск Дугласа-Пекера, м
const FAR_MIN_AREA = 1500
const FAR_CELL = 500 // порядок записи: ячейки 500 м змейкой, чтобы дельты соседних зданий помещались в Int16

function bboxString(b) {
  const south = LAT0 - b.maxZ / M_PER_DEG_LAT
  const north = LAT0 - b.minZ / M_PER_DEG_LAT
  const west = LNG0 + b.minX / M_PER_DEG_LNG
  const east = LNG0 + b.maxX / M_PER_DEG_LNG
  return [south, west, north, east].map((v) => v.toFixed(6)).join(',')
}

/** Только то, что может пройти отбор: высота >= 25 м, >= 8 этажей, периметр >= 150 м (площадь 1500 м^2 даёт периметр >= ~155 м), мультиполигоны. */
function farQuery(b) {
  const bb = bboxString(b)
  const hRe = '^(2[5-9]|[3-9][0-9]|[1-9][0-9]{2})([.,][0-9]+)?( ?m)?$'
  const lRe = '^([89]|[1-9][0-9]+)$'
  return `[out:json][timeout:180];(way["building"]["height"~"${hRe}"](${bb});way["building"]["building:levels"~"${lRe}"](${bb});way["building"](${bb})(if:length()>=150);relation["building"](${bb}););out geom;`
}

function farBlocks() {
  const out = []
  const n = (2 * FAR_RADIUS) / FAR_BLOCK
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const minX = -FAR_RADIUS + ix * FAR_BLOCK
      const minZ = -FAR_RADIUS + iz * FAR_BLOCK
      const nx = Math.max(minX, Math.min(0, minX + FAR_BLOCK))
      const nz = Math.max(minZ, Math.min(0, minZ + FAR_BLOCK))
      if (Math.hypot(nx, nz) >= FAR_RADIUS) continue
      out.push({ ix, iz, minX, maxX: minX + FAR_BLOCK, minZ, maxZ: minZ + FAR_BLOCK })
    }
  }
  return out
}

function subBlock(bl, q) {
  const h = FAR_BLOCK / 2
  const minX = bl.minX + (q % 2) * h
  const minZ = bl.minZ + Math.floor(q / 2) * h
  return { minX, maxX: minX + h, minZ, maxZ: minZ + h }
}

/** Дуглас-Пекер для открытой ломаной; возвращает индексы сохранённых точек. */
function dpKeep(pts, tol) {
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const dist = (p, a, b) => {
    const dx = b.x - a.x
    const dz = b.z - a.z
    const l2 = dx * dx + dz * dz
    if (l2 === 0) return Math.hypot(p.x - a.x, p.z - a.z)
    return Math.abs(dz * (p.x - a.x) - dx * (p.z - a.z)) / Math.sqrt(l2)
  }
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()
    let best = -1
    let bi = -1
    for (let k = i + 1; k < j; k++) {
      const d = dist(pts[k], pts[i], pts[j])
      if (d > best) {
        best = d
        bi = k
      }
    }
    if (best > tol) {
      keep[bi] = 1
      stack.push([i, bi], [bi, j])
    }
  }
  return keep
}

/** Упрощение замкнутого контура: опорные точки — первая и самая дальняя от неё. */
function simplifyRing(ring, tol) {
  const n = ring.length
  if (n <= 4) return ring
  let far = 1
  let fd = -1
  for (let k = 1; k < n; k++) {
    const d = Math.hypot(ring[k].x - ring[0].x, ring[k].z - ring[0].z)
    if (d > fd) {
      fd = d
      far = k
    }
  }
  const a = ring.slice(0, far + 1)
  const b = ring.slice(far).concat([ring[0]])
  const ka = dpKeep(a, tol)
  const kb = dpKeep(b, tol)
  const res = []
  for (let k = 0; k < a.length; k++) if (ka[k]) res.push(a[k])
  for (let k = 1; k < b.length - 1; k++) if (kb[k]) res.push(b[k])
  return res
}

/** Отбирает и упрощает кандидатов; возвращает массив {key, ring, h, kind, cell}. */
function farCandidates(elements, heroBounds, minHeight, minArea, stats) {
  const out = []
  for (const el of elements) {
    let outers
    if (el.type === 'way') {
      if (!el.geometry) continue
      outers = [el.geometry]
    } else {
      const mem = (el.members ?? []).filter((m) => m.type === 'way' && m.geometry)
      outers = joinWays(mem.filter((m) => m.role === 'outer' || m.role === '').map((m) => m.geometry))
    }
    const { h } = buildingHeight(el.tags)
    const key = `${el.type}/${el.id}`
    for (const g of outers) {
      const full = cleanRing(geomToRing(g))
      if (full.length < 3) continue
      const area = Math.abs(shoelace(full))
      if (area < 1) continue
      if (h < minHeight && area < minArea) {
        stats.small++
        continue
      }
      let cx = 0
      let cz = 0
      for (const p of full) {
        cx += p.x
        cz += p.z
      }
      cx /= full.length
      cz /= full.length
      if (Math.hypot(cx, cz) > FAR_RADIUS) {
        stats.outside++
        continue
      }
      if (heroBounds.some((r) => cx >= r.minX && cx <= r.maxX && cz >= r.minZ && cz <= r.maxZ)) {
        stats.inHero++
        continue
      }
      const ring = simplifyRing(full, FAR_TOLERANCE)
      if (ring.length < 3 || Math.abs(shoelace(ring)) < 1) {
        stats.degenerate++
        continue
      }
      if (selfIntersects(ring)) {
        stats.selfIntersect++
        continue
      }
      stats.rawPts += full.length
      stats.simplPts += ring.length
      out.push({
        key,
        ring,
        h,
        kind: buildingKind(el.tags),
        cell: { x: Math.floor(cx / FAR_CELL), z: Math.floor(cz / FAR_CELL) },
      })
    }
  }
  out.sort((a, b2) => {
    if (a.cell.z !== b2.cell.z) return a.cell.z - b2.cell.z
    if (a.cell.x !== b2.cell.x) return a.cell.z % 2 === 0 ? a.cell.x - b2.cell.x : b2.cell.x - a.cell.x
    return a.key < b2.key ? -1 : a.key > b2.key ? 1 : 0
  })
  return out
}

function farPlan(elements, heroBounds, minHeight, minArea) {
  const stats = { small: 0, outside: 0, inHero: 0, degenerate: 0, selfIntersect: 0, triFail: 0, rawPts: 0, simplPts: 0 }
  const cands = farCandidates(elements, heroBounds, minHeight, minArea, stats)
  const c = { x: 0, z: 0 }
  const plan = new Plan()
  for (const k of cands) {
    const fail = addBuilding(plan, k.ring, [], k.h, fnv16(k.key), k.kind, c)
    if (fail) stats[fail === 'selfIntersect' || fail === 'degenerate' ? fail : 'triFail']++
  }
  return { plan, c, stats }
}

async function farMain(refresh) {
  const idxFile = resolve(ROOT, 'public/city/index.json')
  const heroIds = Object.keys(JSON.parse(readFileSync(idxFile, 'utf8')).districts)
  const heroBounds = heroIds.map((id) => districtBounds(id))

  const blocks = farBlocks()
  const seen = new Map()
  console.log(`Дальний город: круг ${FAR_RADIUS} м, блоков ${blocks.length} по ${FAR_BLOCK} м`)
  console.log('Блок · элементов · байт JSON · байт gzip-кэша')
  for (const bl of blocks) {
    // блок 3000 м; если Overpass не отвечает за 4 попытки — делим на 4 части по 1500 м (кэш <ix>_<iz>_<q>)
    const parts = [{ name: `${bl.ix}_${bl.iz}`, b: bl }]
    const baseOf = (name) => resolve(ROOT, 'assets/source/osm/far', name)
    if (!refresh && readCache(baseOf(parts[0].name)) == null && readCache(baseOf(`${parts[0].name}_0`)) != null) {
      parts.length = 0
    }
    if (parts.length === 0) {
      for (let q = 0; q < 4; q++) parts.push({ name: `${bl.ix}_${bl.iz}_${q}`, b: subBlock(bl, q) })
    }
    for (let pi = 0; pi < parts.length; pi++) {
      const { name, b } = parts[pi]
      const base = baseOf(name)
      let raw = refresh ? null : readCache(base)
      let gzBytes
      if (raw == null) {
        try {
          raw = await download(farQuery(b), 3)
        } catch (e) {
          if (parts.length === 1) {
            console.log(`  ${name}: ${e.message} Делю блок на 4 части.`)
            parts.length = 0
            for (let q = 0; q < 4; q++) parts.push({ name: `${bl.ix}_${bl.iz}_${q}`, b: subBlock(bl, q) })
            pi = -1
            continue
          }
          throw e
        }
        JSON.parse(raw) // отсечь HTML-ошибки
        gzBytes = saveCache(base, raw)
      } else {
        gzBytes = existsSync(`${base}.json.gz`) ? readFileSync(`${base}.json.gz`).length : 0
      }
      const els = (JSON.parse(raw).elements ?? []).filter(
        (e) => (e.type === 'way' || e.type === 'relation') && e.tags?.building && e.tags.building !== 'no',
      )
      for (const e of els) seen.set(`${e.type}/${e.id}`, e)
      console.log(`  ${name} · ${els.length} · ${raw.length} · ${gzBytes}`)
    }
  }
  const elements = [...seen.values()].sort((a, b2) => (a.type === b2.type ? a.id - b2.id : a.type < b2.type ? 1 : -1))
  console.log(`Уникальных зданий-кандидатов: ${elements.length}`)

  // порог: сначала растёт высота (площадь 1500), затем площадь (при последней высоте)
  const heights = [25, 30, 35, 40, 45, 50, 60, 70, 80]
  const areas = [2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000]
  const steps = [...heights.map((h) => [h, FAR_MIN_AREA]), ...areas.map((a) => [heights[heights.length - 1], a])]
  console.log('Подбор порога: высота >= H м ИЛИ площадь >= A м^2 · зданий · вершин · треугольников · .bin · gzip')
  let chosen = null
  for (const [mh, ma] of steps) {
    const r = farPlan(elements, heroBounds, mh, ma)
    if (r.plan.rings.length === 0) throw new Error('Нет ни одного здания')
    const enc = encodeTile(r.plan, r.c)
    const gz = gzipSync(enc.buf, { level: 9 }).length
    console.log(
      `  H=${mh} A=${ma} · ${enc.B} · ${enc.V} · ${enc.I / 3} · ${enc.buf.length} · ${gz} (${(gz / 1024).toFixed(1)} КБ)`,
    )
    chosen = { mh, ma, r }
    if (gz <= FAR_GZIP_LIMIT) break
  }
  const { mh, ma, r } = chosen
  console.log(`Выбран порог: высота >= ${mh} м или площадь >= ${ma} м^2; допуск Дугласа-Пекера ${FAR_TOLERANCE} м`)
  console.log(
    `Отброшено: мелких ${r.stats.small}, вне круга ${r.stats.outside}, в районах героя ${r.stats.inHero}, вырожденных ${r.stats.degenerate}, самопересечение ${r.stats.selfIntersect}, сбой триангуляции ${r.stats.triFail}`,
  )
  console.log(`Точек контуров: ${r.stats.rawPts} -> ${r.stats.simplPts} после упрощения`)
  writeTile(r.plan, r.c, FAR_ID, FAR_GZIP_LIMIT)
}

// ---------- main ----------
async function main() {
  const args = process.argv.slice(2)
  const refresh = args.includes('--refresh')
  const district = args.find((a) => !a.startsWith('--'))
  if (!district) {
    console.error('Использование: node scripts/city-bake.mjs <district> [--refresh]')
    process.exit(2)
  }
  if (district === FAR_ID) {
    await farMain(refresh)
    return
  }
  const b = districtBounds(district)
  const cacheBase = resolve(ROOT, 'assets/source/osm', district)

  let raw = refresh ? null : readCache(cacheBase)
  if (raw != null) {
    console.log(`Кэш: ${cacheBase}.json.gz`)
  } else {
    console.log('Запрос к Overpass...')
    raw = await download(buildQuery(b))
    JSON.parse(raw) // отсечь HTML-ошибки
    const n = saveCache(cacheBase, raw)
    console.log(`Сохранено: ${cacheBase}.json.gz (${raw.length} байт -> ${n} байт gzip)`)
  }
  const data = JSON.parse(raw)

  const excludeFile = resolve(ROOT, 'assets/source/osm/landmark-exclude.json')
  const exclude = new Set(existsSync(excludeFile) ? JSON.parse(readFileSync(excludeFile, 'utf8')) : [])

  const elements = (data.elements ?? [])
    .filter((e) => (e.type === 'way' || e.type === 'relation') && e.tags?.building && e.tags.building !== 'no')
    .sort((a, b2) => (a.type === b2.type ? a.id - b2.id : a.type < b2.type ? 1 : -1)) // way, затем relation; внутри — по id

  const stats = {
    total: 0,
    knownHeight: 0,
    selfIntersect: 0,
    degenerate: 0,
    outside: 0,
    excluded: 0,
    noGeometry: 0,
    triFail: 0,
    built: 0,
  }
  const plan = new Plan()
  const c = { x: Math.fround(b.center.x), z: Math.fround(b.center.z) }
  const inside = (p) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ

  for (const el of elements) {
    stats.total++
    const key = `${el.type}/${el.id}`
    if (exclude.has(key)) {
      stats.excluded++
      continue
    }
    let outers = []
    let inners = []
    if (el.type === 'way') {
      if (!el.geometry) {
        stats.noGeometry++
        continue
      }
      outers = [el.geometry]
    } else {
      const mem = (el.members ?? []).filter((m) => m.type === 'way' && m.geometry)
      outers = joinWays(mem.filter((m) => m.role === 'outer' || m.role === '').map((m) => m.geometry))
      inners = joinWays(mem.filter((m) => m.role === 'inner').map((m) => m.geometry))
      if (!outers.length) {
        stats.noGeometry++
        continue
      }
    }
    const { h, known } = buildingHeight(el.tags)
    const seed = fnv16(key)
    const kind = buildingKind(el.tags)
    const innerRings = inners.map((g) => cleanRing(geomToRing(g)))
    let builtAny = false
    let reason = null
    for (const g of outers) {
      const outer = cleanRing(geomToRing(g))
      if (outer.length < 3 || Math.abs(shoelace(outer)) < 1) {
        reason = 'degenerate'
        continue
      }
      if (!outer.every(inside)) {
        reason = 'outside'
        continue
      }
      const holes = innerRings.filter((r) => r.length >= 3 && Math.abs(shoelace(r)) >= 1 && pointInRing(r[0], outer))
      if (selfIntersects(outer) || holes.some(selfIntersects)) {
        reason = 'selfIntersect'
        continue
      }
      const fail = addBuilding(plan, outer, holes, h, seed, kind, c)
      if (fail) reason = fail
      else builtAny = true
    }
    if (builtAny) {
      stats.built++
      if (known) stats.knownHeight++
    } else if (reason) stats[reason]++
  }

  const { B } = writeTile(plan, c, district, GZIP_LIMIT)
  const pct = stats.built ? ((stats.knownHeight / stats.built) * 100).toFixed(1) : '0'
  console.log(`Район: ${district}`)
  console.log(`Зданий в данных: ${stats.total}; элементов OSM запечено: ${stats.built}; записей-зданий в файле: ${B}`)
  console.log(`Доля с известной высотой: ${pct}% (${stats.knownHeight}/${stats.built}, по элементам OSM)`)
  console.log(
    `Пропущено: самопересечение ${stats.selfIntersect}, вне квадрата ${stats.outside}, вырожденных ${stats.degenerate}, без геометрии ${stats.noGeometry}, сбой триангуляции ${stats.triFail}, исключено ориентиры ${stats.excluded}`,
  )
}

const round = (v) => Math.round(v * 100) / 100

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
