import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { useWorldStore } from '../../stores/worldStore'
import { mulberry32 } from '../../utils/math'
import { ScenarioEngine } from '../engine/ScenarioEngine'
import { getEventProgress } from '../time/eventProgress'

describe('worldStore.plan — цепочка поездки для карты', () => {
  beforeAll(() => vi.useFakeTimers())
  afterAll(() => vi.useRealTimers())

  it('goTo публикует непрерывную цепочку from→to до места назначения, eventElapsed пишется раз на событие, прогресс идёт из eventProgress', () => {
    const engine = new ScenarioEngine(mulberry32(7))
    useWorldStore.setState({ started: true, paused: false, clockMode: 'accelerated', weatherSource: 'simulation' })
    engine.prepare('free')
    engine.goTo('vdnh')
    vi.advanceTimersByTime(800)
    engine.tick(1)
    const s = useWorldStore.getState()
    expect(s.plan.length).toBeGreaterThan(0)
    expect(s.plan.filter((l) => l.current)).toHaveLength(1)
    expect(s.plan[0].current).toBe(true)
    // непрерывность: начало следующего участка = конец предыдущего
    for (let i = 1; i < s.plan.length; i++) expect(s.plan[i].from).toBe(s.plan[i - 1].to)
    expect(s.plan.every((l) => l.dest === 'vdnh')).toBe(true)
    expect(s.plan.every((l) => l.duration > 0)).toBe(true)
    // eventElapsed — стартовое значение события (не 4 Гц); живой прогресс читается из eventProgress
    const e0 = s.eventElapsed
    const p0 = getEventProgress()
    vi.advanceTimersByTime(300)
    engine.tick(1)
    expect(useWorldStore.getState().eventElapsed).toBe(e0)
    expect(getEventProgress()).toBeGreaterThanOrEqual(p0)
    expect(getEventProgress()).toBeGreaterThan(0)
    engine.stop()
  })
})
