/**
 * Координаты мира 3D (План §4): метры, начало — Кремль, +X восток, −Z север, +Y вверх.
 * Чистые функции, без three и React.
 * LAT0/LNG0 дублируют неэкспортируемые константы src/data/cityGraph.ts; совпадение проверяет geo.test.ts.
 */
import { LOCATIONS } from '../data/locations'
import type { LocationId } from '../types'

export const LAT0 = 55.752
export const LNG0 = 37.6175
/** Метров на градус долготы на широте LAT0. */
export const M_PER_DEG_LNG = Math.cos((LAT0 * Math.PI) / 180) * 111320
/** Метров на градус широты (План §4). */
export const M_PER_DEG_LAT = 110574
/** Сторона квадрата района, м (План §4). */
export const DISTRICT_SIZE = 1400

export interface XZ {
  x: number
  z: number
}

export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** Без аллокаций: пишет результат в out и возвращает его. */
export function toWorldInto(lat: number, lng: number, out: XZ): XZ {
  out.x = (lng - LNG0) * M_PER_DEG_LNG
  out.z = -(lat - LAT0) * M_PER_DEG_LAT
  return out
}

export function toWorld(lat: number, lng: number): XZ {
  return toWorldInto(lat, lng, { x: 0, z: 0 })
}

export function toLatLng(x: number, z: number): { lat: number; lng: number } {
  return { lat: LAT0 - z / M_PER_DEG_LAT, lng: LNG0 + x / M_PER_DEG_LNG }
}

/** Квадрат 1400×1400 м с центром в локации. */
export function districtBounds(locationId: LocationId): Bounds {
  const loc = LOCATIONS[locationId]
  const c = toWorld(loc.lat, loc.lng)
  const h = DISTRICT_SIZE / 2
  return { minX: c.x - h, maxX: c.x + h, minZ: c.z - h, maxZ: c.z + h }
}
