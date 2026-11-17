import { describe, expect, it } from 'vitest'
import { toKm } from '../data/cityGraph'
import { LOCATIONS, distanceKm } from '../data/locations'
import { DISTRICT_SIZE, LAT0, LNG0, districtBounds, toLatLng, toWorld, toWorldInto } from './geo'

describe('world3d/geo', () => {
  it('Кремль — начало координат', () => {
    const p = toWorld(LAT0, LNG0)
    expect(p.x).toBeCloseTo(0, 6)
    expect(Math.abs(p.z)).toBeCloseTo(0, 6)
  })

  it('LAT0/LNG0 совпадают с cityGraph (toKm в начале = 0, восток совпадает)', () => {
    const o = toKm(LAT0, LNG0)
    expect(o.x).toBeCloseTo(0, 9)
    expect(o.y).toBeCloseTo(0, 9)
    const lat = 55.7298
    const lng = 37.6017
    expect(toWorld(lat, lng).x).toBeCloseTo(toKm(lat, lng).x * 1000, 6)
  })

  it('знаки осей: север — отрицательный z, восток — положительный x', () => {
    expect(toWorld(LAT0 + 0.01, LNG0).z).toBeLessThan(0)
    expect(toWorld(LAT0 - 0.01, LNG0).z).toBeGreaterThan(0)
    expect(toWorld(LAT0, LNG0 + 0.01).x).toBeGreaterThan(0)
    expect(toWorld(LAT0, LNG0 - 0.01).x).toBeLessThan(0)
  })

  it('туда-обратно ≤ 0.5 м на 5 км', () => {
    const cases: Array<[number, number]> = [
      [5000, 0],
      [-5000, 0],
      [0, 5000],
      [0, -5000],
      [3535, -3535],
      [-3535, 3535],
    ]
    for (const [x, z] of cases) {
      const ll = toLatLng(x, z)
      const p = toWorld(ll.lat, ll.lng)
      expect(Math.hypot(p.x - x, p.z - z)).toBeLessThanOrEqual(0.5)
    }
    const g = LOCATIONS['gorky-park']
    const back = toLatLng(toWorld(g.lat, g.lng).x, toWorld(g.lat, g.lng).z)
    expect(back.lat).toBeCloseTo(g.lat, 9)
    expect(back.lng).toBeCloseTo(g.lng, 9)
  })

  it('расстояние между локациями в пределах 1 % от гаверсинуса', () => {
    const pairs: Array<['gorky-park' | 'vdnh' | 'zaryadye', 'gorky-park' | 'vdnh' | 'zaryadye']> = [
      ['gorky-park', 'vdnh'],
      ['gorky-park', 'zaryadye'],
      ['zaryadye', 'vdnh'],
    ]
    for (const [a, b] of pairs) {
      const pa = toWorld(LOCATIONS[a].lat, LOCATIONS[a].lng)
      const pb = toWorld(LOCATIONS[b].lat, LOCATIONS[b].lng)
      const d = Math.hypot(pa.x - pb.x, pa.z - pb.z)
      const ref = distanceKm(a, b) * 1000
      expect(Math.abs(d - ref) / ref).toBeLessThan(0.01)
    }
  })

  it('toWorldInto пишет в out без аллокации и совпадает с toWorld', () => {
    const out = { x: 0, z: 0 }
    const r = toWorldInto(55.7298, 37.6017, out)
    expect(r).toBe(out)
    expect(out).toEqual(toWorld(55.7298, 37.6017))
  })

  it('districtBounds — квадрат 1400 м с центром в локации', () => {
    for (const id of ['arbat', 'vdnh', 'moscow-city'] as const) {
      const b = districtBounds(id)
      const c = toWorld(LOCATIONS[id].lat, LOCATIONS[id].lng)
      expect(b.maxX - b.minX).toBeCloseTo(DISTRICT_SIZE, 6)
      expect(b.maxZ - b.minZ).toBeCloseTo(DISTRICT_SIZE, 6)
      expect((b.minX + b.maxX) / 2).toBeCloseTo(c.x, 6)
      expect((b.minZ + b.maxZ) / 2).toBeCloseTo(c.z, 6)
    }
  })
})
