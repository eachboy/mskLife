import { describe, expect, it } from 'vitest'
import { LOCATIONS } from '../../data/locations'
import { CITY_GRAPH, PLACE_IDS, buildGraph, placeNode, type CityEdge, type CityNode } from '../../data/cityGraph'
import { METRO_LINES, METRO_STATIONS, METRO_TRANSFERS } from '../../data/transit'
import { findRoute } from '../travel/router'
import { planTravel } from '../engine/LocationTransitionManager'
import { validateChain } from '../travel/validateChain'
import { PHASES, canTransition } from '../travel/states'
import { mulberry32 } from '../../utils/math'
import type { ScenarioEvent } from '../../types'

const stationName = (id: string) => METRO_STATIONS.find((s) => s.id === id)?.name

describe('city graph data', () => {
  it('uses real Moscow station names for the places', () => {
    const names = new Set(METRO_STATIONS.map((s) => s.name))
    for (const n of [
      'Парк культуры',
      'Октябрьская',
      'Охотный Ряд',
      'Арбатская',
      'Смоленская',
      'Китай-город',
      'Выставочная',
      'Деловой центр',
      'ВДНХ',
      'Пушкинская',
      'Тверская',
      'Чеховская',
      'Третьяковская',
      'Новокузнецкая',
      'Фрунзенская',
      'Спортивная',
      'Площадь Революции',
    ])
      expect(names.has(n), n).toBe(true)
  })

  it('lines reference existing stations of the same line', () => {
    for (const line of METRO_LINES) {
      expect(line.stations.length).toBeGreaterThan(1)
      for (const id of line.stations) {
        const st = METRO_STATIONS.find((s) => s.id === id)
        expect(st, id).toBeDefined()
        expect(st?.line).toBe(line.id)
      }
    }
  })

  it('has the real interchanges', () => {
    const has = (a: string, b: string) =>
      METRO_TRANSFERS.some(
        (t) => (stationName(t.a) === a && stationName(t.b) === b) || (stationName(t.a) === b && stationName(t.b) === a),
      )
    expect(has('Пушкинская', 'Тверская')).toBe(true)
    expect(has('Пушкинская', 'Чеховская')).toBe(true)
    expect(has('Третьяковская', 'Новокузнецкая')).toBe(true)
    expect(has('Охотный Ряд', 'Театральная')).toBe(true)
    expect(has('Театральная', 'Площадь Революции')).toBe(true)
    expect(has('Выставочная', 'Деловой центр')).toBe(true)
    expect(has('Библиотека имени Ленина', 'Арбатская')).toBe(true)
    // одноимённые пересадки
    for (const n of ['Парк культуры', 'Октябрьская', 'Китай-город', 'Киевская']) {
      const ids = METRO_STATIONS.filter((s) => s.name === n).map((s) => s.id)
      expect(ids.length, n).toBeGreaterThan(1)
      expect(
        METRO_TRANSFERS.some((t) => ids.includes(t.a) && ids.includes(t.b)),
        n,
      ).toBe(true)
    }
  })

  it('every place has a node with km coordinates and is reachable day and night', () => {
    for (const p of PLACE_IDS) {
      const n = CITY_GRAPH.nodes.get(placeNode(p))
      expect(n, p).toBeDefined()
      expect(Number.isFinite(n?.x)).toBe(true)
      expect(Number.isFinite(n?.y)).toBe(true)
      expect(n?.district).toBe(LOCATIONS[p].district)
    }
    for (const minutes of [12 * 60, 3 * 60]) {
      for (const a of PLACE_IDS)
        for (const b of PLACE_IDS) {
          if (a === b) continue
          const r = findRoute(CITY_GRAPH, placeNode(a), placeNode(b), { minutes, weather: 'clear' })
          expect(r, `${a}→${b} @${minutes}`).not.toBeNull()
        }
    }
  })
})

/** Небольшой синтетический граф для проверки самого алгоритма. */
function toyGraph() {
  const nodes: CityNode[] = ['A', 'B', 'S1', 'S2', 'S3', 'T2'].map((id, i) => ({
    id,
    type: id.startsWith('S') || id.startsWith('T') ? 'metro-platform' : 'place',
    name: id,
    district: 'test',
    x: i,
    y: 0,
    area: 'arbat',
  }))
  const always = { from: 0, to: 24 }
  const e = (
    from: string,
    to: string,
    mode: CityEdge['mode'],
    kind: CityEdge['kind'],
    minutes: number,
    line?: string,
  ): CityEdge => ({
    from,
    to,
    mode,
    kind,
    minutes,
    km: minutes / 10,
    line,
    availability: [always],
  })
  const edges: CityEdge[] = [
    e('A', 'B', 'walk', 'street', 60),
    e('A', 'S1', 'walk', 'street', 5),
    e('S1', 'S2', 'metro', 'ride', 10, 'L1'),
    e('S2', 'S3', 'metro', 'ride', 10, 'L1'),
    e('S3', 'B', 'walk', 'street', 5),
    // короче, но с пересадкой
    e('S1', 'T2', 'metro', 'ride', 6, 'L2'),
    e('T2', 'S3', 'metro', 'ride', 6, 'L3'),
  ]
  const lines = new Map([
    ['L1', { id: 'L1', name: 'L1', color: '#f00', mode: 'metro' as const, headway: () => 2 }],
    ['L2', { id: 'L2', name: 'L2', color: '#0f0', mode: 'metro' as const, headway: () => 2 }],
    ['L3', { id: 'L3', name: 'L3', color: '#00f', mode: 'metro' as const, headway: () => 2 }],
  ])
  return buildGraph(nodes, edges, lines)
}

describe('findRoute (Dijkstra)', () => {
  it('finds the shortest path on a toy graph', () => {
    const r = findRoute(toyGraph(), 'A', 'B', { minutes: 600, weather: 'clear', transferPenalty: 0 })
    expect(r).not.toBeNull()
    expect(r?.steps.map((s) => s.edge.to)).toEqual(['S1', 'T2', 'S3', 'B'])
  })

  it('transfer penalty prefers a single line', () => {
    const r = findRoute(toyGraph(), 'A', 'B', { minutes: 600, weather: 'clear', transferPenalty: 15 })
    expect(r?.steps.map((s) => s.edge.to)).toEqual(['S1', 'S2', 'S3', 'B'])
    expect(r?.transfers).toBe(0)
  })

  it('Парк Горького → Китай-город днём: метро по Калужско-Рижской без пересадок', () => {
    const r = findRoute(CITY_GRAPH, placeNode('gorky-park'), placeNode('kitay-gorod'), {
      minutes: 11 * 60,
      weather: 'clear',
    })
    expect(r).not.toBeNull()
    expect(r?.modes).toContain('metro')
    expect(r?.transfers).toBe(0)
    expect(r?.minutes).toBeGreaterThan(15)
    expect(r?.minutes).toBeLessThan(50)
  })

  it('ВДНХ → Москва-Сити needs at least one transfer and stays plausible', () => {
    const r = findRoute(CITY_GRAPH, placeNode('vdnh'), placeNode('moscow-city'), { minutes: 14 * 60, weather: 'clear' })
    expect(r?.modes).toContain('metro')
    expect(r?.transfers).toBeGreaterThanOrEqual(1)
    expect(r?.minutes).toBeGreaterThan(30)
    expect(r?.minutes).toBeLessThan(90)
  })

  it('metro is unavailable at night (01:00–05:30)', () => {
    for (const h of [1.5, 3, 4.5]) {
      const r = findRoute(CITY_GRAPH, placeNode('gorky-park'), placeNode('vdnh'), { minutes: h * 60, weather: 'clear' })
      expect(r).not.toBeNull()
      expect(r?.modes).not.toContain('metro')
    }
    const day = findRoute(CITY_GRAPH, placeNode('gorky-park'), placeNode('vdnh'), {
      minutes: 10 * 60,
      weather: 'clear',
    })
    expect(day?.modes).toContain('metro')
  })

  it('heavy rain reduces walking', () => {
    const walk = (w: 'clear' | 'heavy-rain') => {
      const r = findRoute(CITY_GRAPH, placeNode('arbat'), placeNode('patriarshy'), { minutes: 13 * 60, weather: w })
      return (
        r?.steps.filter((s) => s.edge.mode === 'walk' && s.edge.kind === 'street').reduce((a, s) => a + s.minutes, 0) ??
        0
      )
    }
    expect(walk('heavy-rain')).toBeLessThanOrEqual(walk('clear'))
  })
})

const strip = (evs: ScenarioEvent[]) =>
  evs.map(({ id: _id, trip, ...rest }) => ({ ...rest, trip: trip && { ...trip, id: '' } }))

describe('planTravel on the graph', () => {
  it('is deterministic for the same rng seed', () => {
    const a = planTravel('gorky-park', 'vdnh', 'clear', mulberry32(5), { minutes: 600 })
    const b = planTravel('gorky-park', 'vdnh', 'clear', mulberry32(5), { minutes: 600 })
    expect(strip(a)).toEqual(strip(b))
  })

  it('chains are continuous, legal and start/end at the places', () => {
    const rng = mulberry32(11)
    for (const minutes of [8 * 60, 13 * 60, 23.5 * 60, 2 * 60]) {
      for (const a of PLACE_IDS)
        for (const b of PLACE_IDS) {
          if (a === b) continue
          const chain = planTravel(a, b, 'clear', rng, { minutes })
          expect(chain.length).toBeGreaterThan(0)
          expect(chain[0].from).toBe(placeNode(a))
          expect(chain[chain.length - 1].to).toBe(placeNode(b))
          const issues = validateChain(chain, minutes, { startState: 'IDLE' })
          expect(issues, `${a}→${b} @${minutes}: ${issues.join('; ')}`).toEqual([])
        }
    }
  })

  it('metro trip goes through all station phases in order', () => {
    const chain = planTravel('gorky-park', 'kitay-gorod', 'clear', mulberry32(2), {
      minutes: 11 * 60,
      scenario: 'work',
    })
    const phases = chain.map((e) => e.phase)
    const order = [
      'metro-approach',
      'metro-vestibule',
      'metro-turnstile',
      'metro-escalator-down',
      'metro-platform-wait',
      'metro-train-arrival',
      'metro-boarding',
      'metro-departure',
      'metro-ride',
      'metro-arriving',
      'metro-alighting',
      'metro-escalator-up',
      'metro-exit',
    ]
    let k = -1
    for (const p of order) {
      const i = phases.indexOf(p as never, k + 1)
      expect(i, p).toBeGreaterThan(k)
      k = i
    }
    const ride = chain.find((e) => e.phase === 'metro-ride')
    expect(ride?.location).toBe('metro-ride')
    expect(ride?.line?.name).toBe('Калужско-Рижская')
    expect(['Октябрьская', 'Парк культуры']).toContain(ride?.station)
    expect(ride?.nextStation).toBe('Китай-город')
    expect(chain.find((e) => e.phase === 'metro-platform-wait')?.location).toBe('metro-station')
  })

  it('night trips use night bus or taxi with their phases', () => {
    const chain = planTravel('khamovniki', 'vdnh', 'clear', mulberry32(9), { minutes: 2.5 * 60 })
    const modes = new Set(chain.map((e) => e.mode))
    expect(modes.has('metro')).toBe(false)
    expect(modes.has('taxi') || modes.has('bus')).toBe(true)
    if (modes.has('taxi')) {
      const p = chain.filter((e) => e.mode === 'taxi').map((e) => e.phase)
      expect(p).toEqual(['taxi-order', 'taxi-wait', 'taxi-arrival', 'taxi-boarding', 'taxi-ride', 'taxi-alighting'])
    }
  })

  it('crossing midnight never boards the metro while it is closed', () => {
    for (let seed = 1; seed < 30; seed++) {
      const chain = planTravel('vdnh', 'khamovniki', 'clear', mulberry32(seed), { minutes: 24 * 60 - 25 })
      expect(validateChain(chain, 24 * 60 - 25, { startState: 'IDLE' })).toEqual([])
    }
  })

  it('before 05:30 the hero waits for the first train or takes other transport', () => {
    for (let seed = 1; seed < 20; seed++) {
      const chain = planTravel('courtyard', 'kitay-gorod', 'clear', mulberry32(seed), { minutes: 5 * 60 + 10 })
      expect(validateChain(chain, 5 * 60 + 10, { startState: 'IDLE' })).toEqual([])
    }
  })

  it('events keep scene compatibility: known location, pose and russian caption', () => {
    const chain = planTravel('arbat', 'vdnh', 'light-rain', mulberry32(4), { minutes: 18 * 60 })
    const poses = ['sit', 'walk', 'stand', 'phone', 'drink', 'type', 'sleep', 'wait', 'read']
    for (const e of chain) {
      expect(LOCATIONS[e.location]).toBeDefined()
      expect(LOCATIONS[e.anchor]).toBeDefined()
      expect(poses).toContain(e.pose)
      expect(e.caption).toMatch(/[А-Яа-яЁё]/)
      expect(e.duration).toBeGreaterThan(0)
      const def = e.phase && PHASES[e.phase]
      expect(def).toBeDefined()
      expect(def?.state).toBe(e.travelState)
    }
  })

  it('state machine allows only declared transitions', () => {
    expect(canTransition('RIDING_METRO', 'SITTING')).toBe(false)
    expect(canTransition('WALKING', 'RIDING_BUS')).toBe(false)
    expect(canTransition('ENTERING_TRANSPORT', 'RIDING_METRO')).toBe(true)
    expect(canTransition('RIDING_METRO', 'EXITING_TRANSPORT')).toBe(true)
  })
})
