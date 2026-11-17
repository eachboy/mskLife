import type { TimeMode } from '../../types'

export const TIME_SCALE: Record<TimeMode, number> = { realtime: 1, x5: 5, x15: 15, x60: 60 }

/** Сколько реальных секунд длится событие длительностью durationMin игровых минут. */
export const eventRealSeconds = (durationMin: number, scale: number): number => (durationMin * 60) / scale

/** Игровые минуты за dMs реальных миллисекунд. */
export const gameMinutes = (dMs: number, scale: number): number => (dMs / 60000) * scale

export class SimClock {
  scale = TIME_SCALE.x60
  private wallMs = 0
  constructor(private readonly nowMs: () => number = Date.now) {}
  start(): void {
    this.wallMs = this.nowMs()
  }
  /** Реальные миллисекунды с прошлого вызова. Никогда не отрицательно, сверху не ограничено. */
  stepMs(): number {
    const n = this.nowMs()
    const d = Math.max(0, n - this.wallMs)
    this.wallMs = n
    return d
  }
}
