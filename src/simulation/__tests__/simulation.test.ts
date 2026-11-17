import { describe, expect, it } from 'vitest'
import { LOCATIONS, LOCATION_LIST, SELECTABLE_LOCATIONS } from '../../data/locations'
import { DailyRoutineGenerator } from '../scenarios/DailyRoutineGenerator'
import { planTravel } from '../engine/LocationTransitionManager'
import { mulberry32 } from '../../utils/math'
import type { LocationId, ScenarioMode } from '../../types'

describe('locations data', () => {
  it('has 20 unique locations', () => {
    expect(LOCATION_LIST).toHaveLength(20)
    expect(new Set(LOCATION_LIST.map((l) => l.id)).size).toBe(20)
    expect(SELECTABLE_LOCATIONS.length).toBeGreaterThan(8)
  })
})

describe('planTravel (no teleporting)', () => {
  const outdoor = SELECTABLE_LOCATIONS.filter((l) => l.outdoor).map((l) => l.id)
  it('empty for same place', () => expect(planTravel('arbat', 'arbat', 'clear')).toEqual([]))
  it('every route ends near the destination and uses intermediate scenes', () => {
    const rng = mulberry32(7)
    for (const a of outdoor)
      for (const b of outdoor) {
        if (a === b) continue
        const chain = planTravel(a, b, 'clear', rng)
        expect(chain.length).toBeGreaterThan(0)
        const last = chain[chain.length - 1]
        expect(last.anchor === b || last.destination === b).toBe(true)
        for (const e of chain) expect(e.duration).toBeGreaterThan(0)
        // длинный путь — не пешком
        if (chain.length === 1) expect(chain[0].kind).toBe('stroll')
      }
  })
  it('bad weather avoids long walks', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 20; i++) {
      const chain = planTravel('gorky-park', 'vdnh', 'heavy-rain', rng, { minutes: 13 * 60 })
      const walk = chain.filter((e) => e.mode === 'walk' && e.pose === 'walk').reduce((a, e) => a + e.duration, 0)
      // 10 км: пешком было бы ~3 часа; остаются только подходы через парки и к станциям
      expect(walk).toBeLessThan(45)
    }
  })
})

describe('DailyRoutineGenerator', () => {
  const modes: ScenarioMode[] = ['free', 'work', 'rainy', 'winter', 'night', 'random']
  it('produces non-empty, positive-duration events and varies over a day', () => {
    for (const mode of modes) {
      const g = new DailyRoutineGenerator(mulberry32(42))
      let minutes = 8 * 60
      let anchor: LocationId = 'arbat'
      let last = null as never
      const kinds = new Set<string>()
      for (let i = 0; i < 40; i++) {
        const evs = g.next({ minutes, mode, weather: 'clear', anchor, lastKind: last })
        expect(evs.length).toBeGreaterThan(0)
        for (const e of evs) {
          expect(e.duration).toBeGreaterThan(0)
          kinds.add(e.kind)
          minutes += e.duration
        }
        last = evs[evs.length - 1].kind as never
        const tail = evs[evs.length - 1]
        if (LOCATIONS[tail.anchor]?.outdoor) anchor = tail.anchor
      }
      expect(kinds.size).toBeGreaterThan(3)
    }
  })
  it('night mode never schedules work', () => {
    const g = new DailyRoutineGenerator(mulberry32(1))
    for (let i = 0; i < 60; i++) {
      const evs = g.next({ minutes: 22 * 60, mode: 'night', weather: 'clear', anchor: 'arbat', lastKind: null })
      expect(evs.some((e) => e.kind === 'work')).toBe(false)
    }
  })
})
