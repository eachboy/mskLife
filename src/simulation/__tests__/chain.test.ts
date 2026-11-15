import { describe, expect, it } from 'vitest'
import { LOCATIONS } from '../../data/locations'
import { simulateRoutine } from '../scenarios/simulateRoutine'
import { validateChain } from '../travel/validateChain'
import { PHASES } from '../travel/states'
import type { ScenarioMode } from '../../types'

const MODES: ScenarioMode[] = ['free', 'work', 'rainy', 'winter', 'night', 'random']
const DAYS = 7

describe.each(MODES)('7 game days, mode %s', (mode) => {
  const run = simulateRoutine({ mode, days: DAYS, seed: 1234 + mode.length })
  const { events, starts } = run

  it('covers at least 7 days of continuous game time', () => {
    expect(run.endMinutes - run.startMinutes).toBeGreaterThanOrEqual(DAYS * 1440)
    expect(events.length).toBeGreaterThan(DAYS * 20)
  })

  it('chain invariants hold: no teleport, from/to continuity, legal states, plausible durations, metro hours', () => {
    const issues = validateChain(events, run.startMinutes, { startState: 'IDLE' })
    expect(issues.slice(0, 10)).toEqual([])
  })

  it('time is monotonic and matches the sum of durations', () => {
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThan(starts[i - 1])
    const total = events.reduce((a, e) => a + e.duration * (e.clockRate ?? 1), 0)
    expect(run.endMinutes - run.startMinutes).toBeCloseTo(total, 6)
  })

  it('never repeats the same activity twice in a row (except work blocks)', () => {
    const acts = events.filter((e) => e.phase === 'activity')
    for (let i = 1; i < acts.length; i++) {
      if (acts[i].kind === 'work') continue
      expect(acts[i].kind, `#${i} ${acts[i - 1].kind}→${acts[i].kind}`).not.toBe(acts[i - 1].kind)
    }
  })

  it('every event is renderable by existing scenes', () => {
    for (const e of events) {
      expect(LOCATIONS[e.location], e.kind).toBeDefined()
      expect(e.phase && PHASES[e.phase]).toBeDefined()
      expect(e.caption.length).toBeGreaterThan(3)
    }
  })

  it('visits several places and uses several transport modes', () => {
    const places = new Set(events.filter((e) => e.phase === 'activity').map((e) => e.anchor))
    expect(places.size).toBeGreaterThanOrEqual(4)
    const modes = new Set(events.map((e) => e.mode).filter(Boolean))
    expect(modes.has('walk')).toBe(true)
    expect(modes.size).toBeGreaterThanOrEqual(2)
  })

  it('is deterministic with the same seed', () => {
    const again = simulateRoutine({ mode, days: 2, seed: 1234 + mode.length })
    const first = simulateRoutine({ mode, days: 2, seed: 1234 + mode.length })
    expect(again.events.map((e) => `${e.phase}|${e.location}|${e.duration}`)).toEqual(
      first.events.map((e) => `${e.phase}|${e.location}|${e.duration}`),
    )
  })
})

describe('mode semantics', () => {
  it('night mode: daytime is spent at home asleep, nights out', () => {
    const { events, starts } = simulateRoutine({ mode: 'night', days: DAYS, seed: 77 })
    let outdoorNight = 0
    events.forEach((e, i) => {
      if (e.phase !== 'activity') return
      const h = (starts[i] / 60) % 24
      if (h >= 7 && h < 20.5) expect(['sleep', 'wake', 'home-night'], `${e.kind} @${h.toFixed(2)}`).toContain(e.kind)
      if ((h >= 21 || h < 4) && LOCATIONS[e.location].outdoor) outdoorNight++
    })
    expect(outdoorNight).toBeGreaterThan(DAYS)
  })

  it('work mode: the hero works in the office on most days', () => {
    const { events, starts } = simulateRoutine({ mode: 'work', days: DAYS, seed: 5 })
    const days = new Set<number>()
    events.forEach((e, i) => {
      if (e.kind === 'work') {
        expect(e.location).toBe('office')
        days.add(Math.floor(starts[i] / 1440))
      }
    })
    expect(days.size).toBeGreaterThanOrEqual(DAYS - 1)
  })

  it('rainy mode prefers indoor places', () => {
    const { events } = simulateRoutine({ mode: 'rainy', days: DAYS, seed: 9 })
    let indoor = 0
    let outdoor = 0
    for (const e of events) {
      if (e.phase !== 'activity' || e.kind === 'sleep') continue
      if (LOCATIONS[e.location].outdoor) outdoor += e.duration
      else indoor += e.duration
    }
    expect(indoor).toBeGreaterThan(outdoor)
  })

  it('outside night mode the hero sleeps every night', () => {
    for (const mode of ['free', 'work', 'random'] as ScenarioMode[]) {
      const { events } = simulateRoutine({ mode, days: DAYS, seed: 3 })
      expect(events.filter((e) => e.kind === 'sleep').length, mode).toBeGreaterThanOrEqual(DAYS - 1)
    }
  })
})

describe('validateChain catches violations', () => {
  const { events, startMinutes } = simulateRoutine({ mode: 'free', days: 1, seed: 21 })
  it('detects a teleport (activity jumps to another place)', () => {
    const i = events.findIndex((e, k) => k > 0 && e.phase === 'activity' && events[k - 1].phase === 'activity')
    const k = i > 0 ? i : events.findIndex((e, n) => n > 2 && e.phase === 'activity')
    const broken = [...events]
    broken.splice(k + 1, 0, {
      ...events[k],
      id: 'x',
      location: 'vdnh',
      anchor: 'vdnh',
      from: 'place:vdnh',
      to: 'place:vdnh',
    })
    expect(validateChain(broken, startMinutes).some((s) => /разрыв|телепорт/.test(s))).toBe(true)
  })
  it('detects an illegal state transition', () => {
    const k = events.findIndex((e) => e.phase === 'metro-ride' || e.phase === 'bus-ride' || e.phase === 'taxi-ride')
    expect(k).toBeGreaterThan(0)
    const broken = events.map((e, n) => (n === k + 1 ? { ...e, travelState: 'SITTING' as const } : e))
    expect(validateChain(broken, startMinutes).some((s) => /запрещён|≠/.test(s))).toBe(true)
  })
  it('detects metro boarding while closed', () => {
    const k = events.findIndex((e) => e.phase === 'metro-vestibule')
    if (k < 0) return
    const before = events.slice(0, k).reduce((a, e) => a + e.duration * (e.clockRate ?? 1), 0)
    const shift = (((3 * 60 - (startMinutes + before)) % 1440) + 1440) % 1440
    expect(
      validateChain(events.slice(k), 0 + (startMinutes + before + shift)).some((s) =>
        /метро закрыто|вне часов/.test(s),
      ),
    ).toBe(true)
  })
})
