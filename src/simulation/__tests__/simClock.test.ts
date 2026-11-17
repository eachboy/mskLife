import { describe, expect, it } from 'vitest'
import {
  beginEvent,
  getEventKey,
  getEventProgress,
  getEventRealMs,
  pauseEvent,
  resumeEvent,
} from '../time/eventProgress'
import { eventRealSeconds, gameMinutes, SimClock, TIME_SCALE } from '../time/simClock'

describe('формулы времени (§1.1)', () => {
  it('TIME_SCALE', () => {
    expect(TIME_SCALE).toEqual({ realtime: 1, x5: 5, x15: 15, x60: 60 })
  })
  it('40 игровых минут: 2400 с / 160 с / 40 с', () => {
    expect(eventRealSeconds(40, 1)).toBe(2400)
    expect(eventRealSeconds(40, 15)).toBe(160)
    expect(eventRealSeconds(40, 60)).toBe(40)
  })
  it('gameMinutes', () => {
    expect(gameMinutes(60000, 1)).toBe(1)
    expect(gameMinutes(1000, 60)).toBe(1)
    expect(gameMinutes(4000, 15)).toBe(1)
  })
})

describe('SimClock (§1.2)', () => {
  it('разрыв 3 ч не клампится', () => {
    let t = 1_000_000
    const c = new SimClock(() => t)
    c.start()
    t += 3 * 3600 * 1000
    expect(c.stepMs()).toBe(3 * 3600 * 1000)
    expect(c.stepMs()).toBe(0)
  })
  it('перевод часов назад даёт 0, отсчёт сбрасывается', () => {
    let t = 5_000_000
    const c = new SimClock(() => t)
    c.start()
    t -= 10_000
    expect(c.stepMs()).toBe(0)
    t += 500
    expect(c.stepMs()).toBe(500)
  })
})

describe('eventProgress (§1.5)', () => {
  it('прогресс 0..1', () => {
    beginEvent(7, 1, 60, 0, 1000) // 1 мин при 60× = 1 с
    expect(getEventKey()).toBe(7)
    expect(getEventRealMs()).toBe(1000)
    expect(getEventProgress(1000)).toBe(0)
    expect(getEventProgress(500)).toBe(0)
    expect(getEventProgress(1500)).toBeCloseTo(0.5, 10)
    expect(getEventProgress(99999)).toBe(1)
  })
  it('пауза и возобновление', () => {
    beginEvent(1, 1, 60, 0, 0)
    pauseEvent(400)
    expect(getEventProgress(5000)).toBeCloseTo(0.4, 10)
    resumeEvent(5000)
    expect(getEventProgress(5300)).toBeCloseTo(0.7, 10)
  })
  it('смена scale с elapsedMin не сбрасывает прогресс', () => {
    beginEvent(2, 40, 60, 0, 0) // 40 с
    const before = getEventProgress(10_000) // 0.25
    const elapsedMin = before * 40
    beginEvent(2, 40, 15, elapsedMin, 10_000)
    expect(getEventProgress(10_000)).toBeCloseTo(before, 10)
    expect(getEventRealMs()).toBe(160_000)
  })
})
