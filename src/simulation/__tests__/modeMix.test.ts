import { describe, expect, it } from 'vitest'
import { simulateRoutine } from '../scenarios/simulateRoutine'
import type { ScenarioMode, TravelMode } from '../../types'

/** Доли видов транспорта по поездкам за неделю: город должен ощущаться разнообразным, но правдоподобным. */
function mix(mode: ScenarioMode) {
  const { events } = simulateRoutine({ mode, days: 7, seed: 4242 })
  const seen = new Set<string>()
  const count: Partial<Record<TravelMode, number>> = {}
  let trips = 0
  let walkOnly = 0
  for (const e of events) {
    if (!e.trip || seen.has(e.trip.id)) continue
    seen.add(e.trip.id)
    trips++
    if (e.trip.modes.every((m) => m === 'walk')) walkOnly++
    for (const m of new Set(e.trip.modes)) count[m] = (count[m] ?? 0) + 1
  }
  const share = (m: TravelMode) => (count[m] ?? 0) / Math.max(1, trips)
  return { trips, share, walkOnly: walkOnly / Math.max(1, trips) }
}

describe('transport mix over a week', () => {
  it.each(['free', 'work', 'random'] as ScenarioMode[])(
    '%s: metro and bus are common, taxi is the exception',
    (mode) => {
      const { trips, share } = mix(mode)
      expect(trips).toBeGreaterThan(40)
      expect(share('metro')).toBeGreaterThan(0.2)
      expect(share('bus')).toBeGreaterThan(0.05)
      expect(share('taxi')).toBeLessThan(0.4)
    },
  )

  it('night mode relies on walking, night buses and taxi after the metro closes', () => {
    const { share, walkOnly } = mix('night')
    expect(share('metro')).toBeLessThan(0.35)
    expect(share('taxi') + share('bus') + walkOnly).toBeGreaterThan(0.6)
  })
})
