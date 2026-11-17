import { afterEach, describe, expect, it } from 'vitest'
import { TIME_SCALE, eventRealSeconds } from '../../simulation/time/simClock'
import type { ScenarioEvent, TimeMode } from '../../types'
import { installContextCounter, liveContextCount, resetContextCounter, travelInput } from './AudioLifecycleManager'

const ev = (over: Partial<ScenarioEvent>): ScenarioEvent => ({ location: 'metro-station', duration: 3, ...over }) as ScenarioEvent

describe('travelInput — реальные секунды фазы (B-04)', () => {
  it('x60: секунды те же, что раньше (duration в игровых минутах = реальные секунды)', () => {
    for (const d of [0.2, 1, 3, 12.5, 40]) expect(travelInput(ev({ duration: d }), 'x60').duration).toBeCloseTo(d, 9)
  })

  it('остальные режимы: eventRealSeconds(duration, TIME_SCALE[mode])', () => {
    const modes: TimeMode[] = ['realtime', 'x5', 'x15', 'x60']
    for (const m of modes) expect(travelInput(ev({ duration: 3 }), m).duration).toBeCloseTo(eventRealSeconds(3, TIME_SCALE[m]), 9)
    expect(travelInput(ev({ duration: 3 }), 'realtime').duration).toBe(180)
    expect(travelInput(ev({ duration: 3 }), 'x15').duration).toBe(12)
  })

  it('фаза и звуки передаются как есть', () => {
    const i = travelInput(ev({ phase: 'metro-ride', sounds: ['tunnel'] }), 'x60')
    expect(i.phase).toBe('metro-ride')
    expect(i.sounds).toEqual(['tunnel'])
  })
})

describe('счётчик AudioContext (B-11)', () => {
  afterEach(() => resetContextCounter())

  it('до установки — null; после — считает живые контексты, closed не считает', () => {
    expect(liveContextCount()).toBeNull()
    class FakeCtx {
      state = 'running'
    }
    const win = { AudioContext: FakeCtx } as unknown as Window & typeof globalThis
    installContextCounter(win)
    installContextCounter(win) // идемпотентно
    expect(liveContextCount()).toBe(0)
    const a = new win.AudioContext() as unknown as FakeCtx
    expect(liveContextCount()).toBe(1)
    const b = new win.AudioContext() as unknown as FakeCtx
    expect(liveContextCount()).toBe(2)
    b.state = 'closed'
    expect(liveContextCount()).toBe(1)
    expect(a.state).toBe('running')
  })
})
