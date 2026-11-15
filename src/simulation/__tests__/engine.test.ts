import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { SELECTABLE_LOCATIONS } from '../../data/locations'
import { useWorldStore } from '../../stores/worldStore'
import type { ScenarioEvent, ScenarioMode, TravelState } from '../../types'
import { eventBus } from '../../utils/eventBus'
import { mulberry32 } from '../../utils/math'
import { ScenarioEngine } from '../engine/ScenarioEngine'
import { canTransition } from '../travel/states'

describe('ScenarioEngine plays a continuous chain, even with user goTo mid-trip', () => {
  beforeAll(() => vi.useFakeTimers())
  afterAll(() => vi.useRealTimers())

  it.each(['free', 'work', 'night'] as ScenarioMode[])('%s: 2 game days with random goTo', (mode) => {
    const rng = mulberry32(99)
    const engine = new ScenarioEngine(mulberry32(mode.length))
    useWorldStore.setState({ started: true, paused: false, clockMode: 'accelerated', weatherSource: 'simulation' })
    const played: ScenarioEvent[] = []
    const states: TravelState[] = []
    const offState = eventBus.on('travel-state', (p) => states.push(p.state))
    const unsub = useWorldStore.subscribe((s, p) => {
      if (s.event && s.event !== p.event) played.push(s.event)
    })
    engine.prepare(mode)
    const places = SELECTABLE_LOCATIONS.map((l) => l.id)
    let gameMinutes = 0
    let i = 0
    while (gameMinutes < 2 * 1440) {
      const before = useWorldStore.getState().minutes
      engine.tick(1)
      vi.advanceTimersByTime(700)
      const after = useWorldStore.getState().minutes
      gameMinutes += (after - before + 1440) % 1440
      if (++i % 173 === 0) engine.goTo(places[Math.floor(rng() * places.length)])
      if (i > 40000) break
    }
    unsub()
    offState()
    engine.stop()

    expect(gameMinutes).toBeGreaterThanOrEqual(2 * 1440)
    expect(played.length).toBeGreaterThan(100)
    for (let k = 1; k < played.length; k++) {
      const a = played[k - 1]
      const b = played[k]
      expect(b.from, `#${k} ${a.phase}(${a.to}) → ${b.phase}(${b.from})`).toBe(a.to)
      expect(canTransition(a.travelState!, b.travelState!), `#${k} ${a.travelState} → ${b.travelState}`).toBe(true)
    }
    expect(states.length).toBe(played.length)
  })
})
