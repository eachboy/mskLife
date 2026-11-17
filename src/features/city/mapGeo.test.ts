import { describe, expect, it } from 'vitest'
import { CITY_GRAPH, placeNode, platformNode, stopNode } from '../../data/cityGraph'
import {
  BUS_MAP_LINES,
  compressRadius,
  kmToGrid,
  legPath,
  MAP_PINS,
  METRO_MAP_LINES,
  nodeGrid,
  pinFor,
  pointAt,
  polylineLength,
  RIVER_POINTS,
  screenToPlaneDelta,
  smoothPath,
} from './mapGeo'

describe('проекция карты', () => {
  it('Кремль — центр сетки, радиус монотонен и совпадает с кольцами', () => {
    expect(kmToGrid({ x: 0, y: 0 })).toEqual({ x: 500, y: 500 })
    expect(compressRadius(1.4)).toBe(140)
    expect(compressRadius(2.6)).toBe(220)
    expect(compressRadius(5.5)).toBe(310)
    expect(compressRadius(9)).toBe(420)
    for (let km = 0; km < 14; km += 0.5) expect(compressRadius(km + 0.5)).toBeGreaterThanOrEqual(compressRadius(km))
  })

  it('все узлы графа и все пины лежат внутри сетки 1000×1000', () => {
    for (const n of CITY_GRAPH.nodes.values()) {
      const p = nodeGrid(n.id)
      expect(p, n.id).not.toBeNull()
      expect(p?.x).toBeGreaterThanOrEqual(0)
      expect(p?.x).toBeLessThanOrEqual(1000)
      expect(p?.y).toBeGreaterThanOrEqual(0)
      expect(p?.y).toBeLessThanOrEqual(1000)
    }
    for (const p of MAP_PINS) {
      expect(p.pos.x).toBeGreaterThan(0)
      expect(p.pos.x).toBeLessThan(1000)
      expect(p.pos.y).toBeGreaterThan(0)
      expect(p.pos.y).toBeLessThan(1000)
    }
  })

  it('география: Арбат западнее центра, Сити ещё западнее, Парк Горького юго-западнее, ВДНХ севернее', () => {
    const arbat = pinFor('arbat')!.pos
    const city = pinFor('moscow-city')!.pos
    const gorky = pinFor('gorky-park')!.pos
    const vdnh = pinFor('vdnh')!.pos
    expect(arbat.x).toBeLessThan(500)
    expect(city.x).toBeLessThan(arbat.x)
    expect(gorky.x).toBeLessThan(500)
    expect(gorky.y).toBeGreaterThan(500)
    expect(vdnh.y).toBeLessThan(250)
  })

  it('пины зданий не слипаются с соседями (≥ 39 единиц)', () => {
    for (let i = 0; i < MAP_PINS.length; i++)
      for (let j = i + 1; j < MAP_PINS.length; j++) {
        const d = Math.hypot(MAP_PINS[i].pos.x - MAP_PINS[j].pos.x, MAP_PINS[i].pos.y - MAP_PINS[j].pos.y)
        expect(d, `${MAP_PINS[i].id}/${MAP_PINS[j].id}`).toBeGreaterThan(39)
      }
  })

  it('река: излучина тянется от Сити через Лужники и Парк Горького к Кремлю и Зарядью', () => {
    expect(RIVER_POINTS[0].x).toBeLessThan(RIVER_POINTS[RIVER_POINTS.length - 1].x)
    const d = smoothPath(RIVER_POINTS)
    expect(d.startsWith('M')).toBe(true)
    expect((d.match(/C/g) ?? []).length).toBe(RIVER_POINTS.length - 1)
    // река проходит рядом с Парком Горького
    const gorky = pinFor('gorky-park')!.pos
    expect(Math.min(...RIVER_POINTS.map((p) => Math.hypot(p.x - gorky.x, p.y - gorky.y)))).toBeLessThan(40)
  })
})

describe('пути рёбер', () => {
  it('метро идёт по станциям линии, а не напрямик', () => {
    const p = legPath(platformNode('1-lubyanka'), platformNode('1-park-kultury'), '1')
    expect(p.length).toBe(5) // Лубянка, Охотный Ряд, Библиотека, Кропоткинская, Парк культуры
    const direct = polylineLength([p[0], p[p.length - 1]])
    expect(polylineLength(p)).toBeGreaterThanOrEqual(direct)
  })

  it('на кольцевой линии выбирается короткая дуга', () => {
    const p = legPath(platformNode('5-park-kultury'), platformNode('5-kievskaya'), '5')
    expect(p.length).toBeLessThanOrEqual(3) // Парк культуры → Киевская соседние через замыкание кольца
  })

  it('автобус идёт по остановкам маршрута; ночной вариант использует трассу дневного', () => {
    const a = legPath(stopNode('sukharevskaya-pl'), stopNode('kudrinskaya'), 'sadovoe')
    expect(a.length).toBe(3)
    expect(legPath(stopNode('sukharevskaya-pl'), stopNode('kudrinskaya'), 'sadovoe-night')).toEqual(a)
  })

  it('пешком и такси — прямой отрезок; одинаковые точки — одна', () => {
    expect(legPath(placeNode('arbat'), placeNode('tverskaya'))).toHaveLength(2)
    expect(legPath(placeNode('arbat'), placeNode('arbat'))).toHaveLength(1)
  })

  it('каждая линия метро и автобуса имеет геометрию', () => {
    for (const l of [...METRO_MAP_LINES, ...BUS_MAP_LINES]) expect(l.points.length, l.id).toBeGreaterThanOrEqual(2)
  })

  it('pointAt: начало, середина, конец и зажим доли', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]
    expect(pointAt(pts, 0)).toEqual({ x: 0, y: 0 })
    expect(pointAt(pts, 0.5)).toEqual({ x: 100, y: 0 })
    expect(pointAt(pts, 1)).toEqual({ x: 100, y: 100 })
    expect(pointAt(pts, 2)).toEqual({ x: 100, y: 100 })
    expect(pointAt(pts, 0.25)).toEqual({ x: 50, y: 0 })
  })
})

describe('камера', () => {
  it('экранное смещение → плоскость: вертикаль растягивается на 1/cos(52°), масштаб делит', () => {
    const d = screenToPlaneDelta(0, 10, 0, 1)
    expect(d.x).toBeCloseTo(0, 6)
    expect(d.y).toBeCloseTo(10 / Math.cos((52 * Math.PI) / 180), 4)
    const z = screenToPlaneDelta(10, 0, 0, 2)
    expect(z.x).toBeCloseTo(5, 6)
  })

  it('поворот yaw учитывается: сдвиг вправо на экране при yaw=−12° не чисто по x плоскости', () => {
    const d = screenToPlaneDelta(10, 0, -12, 1)
    expect(d.y).not.toBeCloseTo(0, 3)
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(10, 4)
  })
})
