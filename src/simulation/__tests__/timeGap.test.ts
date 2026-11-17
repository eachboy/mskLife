import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorldStore } from '../../stores/worldStore'
import type { TimeMode } from '../../types'
import { eventBus } from '../../utils/eventBus'
import { mulberry32 } from '../../utils/math'
import { ScenarioEngine } from '../engine/ScenarioEngine'

const T0 = Date.parse('2026-05-04T06:00:00Z')
const HOUR = 3600_000

interface Snapshot {
  key: number
  location: string
  minutes: number
}

function boot(mode: TimeMode, seed: number): ScenarioEngine {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(T0)
  useWorldStore.setState({
    started: true,
    paused: false,
    clockMode: 'accelerated',
    timeMode: mode,
    weatherSource: 'simulation',
    dayCount: 0,
    eventKey: 0,
  })
  const engine = new ScenarioEngine(mulberry32(seed))
  engine.start('free')
  return engine
}

const snap = (): Snapshot => {
  const s = useWorldStore.getState()
  return { key: s.eventKey, location: s.location, minutes: s.minutes }
}

const minuteDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 1440
  return Math.min(d, 1440 - d)
}

describe('разрыв таймера: перемотка = непрерывная работа', () => {
  afterEach(() => vi.useRealTimers())

  // x60: 180 с реального времени = 3 игровых часа (разрыв > 2 с -> перемотка)
  // realtime: 3 реальных часа
  it.each([
    ['x60', 180_000],
    ['realtime', 3 * HOUR],
  ] as [TimeMode, number][])('%s: разрыв %i мс', (mode, gapMs) => {
    // непрерывный прогон
    const a = boot(mode, 4242)
    vi.advanceTimersByTime(gapMs + 1000)
    const cont = snap()
    a.stop()
    vi.useRealTimers()

    // с разрывом
    const b = boot(mode, 4242)
    vi.advanceTimersByTime(1000)
    const sounds: unknown[] = []
    const off = eventBus.on('travel-sound', (p) => sounds.push(p))
    const caption = vi.fn()
    useWorldStore.setState({ setCaption: caption })
    let curtains = 0
    const unsub = useWorldStore.subscribe((s, p) => {
      if (s.transitionTo && !p.transitionTo) curtains++
    })
    vi.setSystemTime(T0 + 1000 + gapMs)
    const t = performance.now()
    b.loop()
    const spent = performance.now() - t
    const sameKeyBeforeSettle = useWorldStore.getState().event
    vi.advanceTimersByTime(1000) // дать закончиться занавесу финального события
    const gap = snap()
    const last = useWorldStore.getState().event
    off()
    unsub()
    b.stop()

    expect(sameKeyBeforeSettle).toBeTruthy()
    // прогон реально продвинулся (иначе сравнение бессмысленно)
    expect(cont.key).toBeGreaterThanOrEqual(5)
    expect(gap.key).toBeGreaterThanOrEqual(5)
    // (а) состояние совпадает с непрерывным прогоном ± 1 событие
    expect(Math.abs(gap.key - cont.key)).toBeLessThanOrEqual(1)
    if (gap.key === cont.key) expect(gap.location).toBe(cont.location)
    expect(minuteDiff(gap.minutes, cont.minutes)).toBeLessThanOrEqual(2)
    // (б) звук — не больше подсказок последнего события
    expect(sounds.length).toBeLessThanOrEqual(last?.sounds?.length ?? 0)
    // (в) подпись — не чаще одного раза
    expect(caption.mock.calls.length).toBeLessThanOrEqual(1)
    // (г) время перемотки
    expect(spent).toBeLessThan(50)
    // (д) занавес — не более чем для финального события
    expect(curtains).toBeLessThanOrEqual(1)
  })
})

describe('часы пишутся редко', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }))
  afterEach(() => vi.useRealTimers())

  it('minutes пишется только при смене целой минуты, eventElapsed — при смене события', () => {
    vi.setSystemTime(T0)
    useWorldStore.setState({
      started: true,
      paused: false,
      clockMode: 'accelerated',
      timeMode: 'realtime',
      dayCount: 0,
    })
    const e = new ScenarioEngine(mulberry32(5))
    e.start('free')
    let minuteWrites = 0
    let elapsedWrites = 0
    const unsub = useWorldStore.subscribe((s, p) => {
      if (s.minutes !== p.minutes) minuteWrites++
      if (s.eventElapsed !== p.eventElapsed) elapsedWrites++
    })
    vi.advanceTimersByTime(60_000)
    unsub()
    e.stop()
    expect(minuteWrites).toBeLessThanOrEqual(2)
    expect(elapsedWrites).toBeLessThanOrEqual(2)
  })
})
