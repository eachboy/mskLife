/**
 * Замеры времени перемотки: стенные часы, поэтому файл идёт в проекте `perf` (vite.config.ts) строго после остальных
 * тестов и без соседей — параллельная нагрузка удваивала замер (125 мс в покое → 250–1500 мс при полном прогоне).
 * Пороги — бюджет §6 аудита (решение пользователя 16.11): x60 ≤ 250 мс, realtime ≤ 50 мс.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorldStore } from '../../stores/worldStore'
import type { TimeMode } from '../../types'
import { eventBus } from '../../utils/eventBus'
import { mulberry32 } from '../../utils/math'
import { ScenarioEngine } from '../engine/ScenarioEngine'

const T0 = Date.parse('2026-05-04T06:00:00Z')
const HOUR = 3600_000

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

describe('перемотка: время', () => {
  afterEach(() => vi.useRealTimers())

  it('x60, разрыв 3 реальных часа: не больше 2000 событий, быстро, без звука', () => {
    // время — минимум из 5 прогонов: одиночный замер стенных часов шумит под нагрузкой машины
    // (124 мс в покое, 157–266 мс при параллельном браузере); функциональные проверки — в каждом прогоне
    let best = Number.POSITIVE_INFINITY
    for (let run = 0; run < 5; run++) {
      const b = boot('x60', 7)
      vi.advanceTimersByTime(1000)
      const sounds: unknown[] = []
      const off = eventBus.on('travel-sound', (p) => sounds.push(p))
      const keyBefore = useWorldStore.getState().eventKey
      vi.setSystemTime(T0 + 1000 + 3 * HOUR)
      const t = performance.now()
      b.loop()
      best = Math.min(best, performance.now() - t)
      off()
      b.stop()
      vi.useRealTimers()
      const played = useWorldStore.getState().eventKey - keyBefore
      expect(played).toBeLessThanOrEqual(2000)
      expect(sounds.length).toBeLessThanOrEqual(8)
      expect(played).toBeGreaterThan(100)
    }
    // бюджет §6 аудита: ≤ 250 мс для 60× на лимите 2000 событий (realtime — ≤ 50 мс, тест ниже).
    // В покое ~125 мс; запас — под загруженную машину (решение пользователя 16.11).
    expect(best).toBeLessThan(250)
  })

  it('realtime, разрыв 8 ч: <= 2000 событий и <= 50 мс', () => {
    const b = boot('realtime', 11)
    vi.advanceTimersByTime(1000)
    const keyBefore = useWorldStore.getState().eventKey
    vi.setSystemTime(T0 + 1000 + 8 * HOUR)
    const t = performance.now()
    b.loop()
    const spent = performance.now() - t
    b.stop()
    const played = useWorldStore.getState().eventKey - keyBefore
    expect(played).toBeGreaterThan(5)
    expect(played).toBeLessThanOrEqual(2000)
    expect(spent).toBeLessThan(50)
  })
})
