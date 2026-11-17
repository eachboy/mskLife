import { eventRealSeconds } from './simClock'

const st = { key: 0, startMs: 0, durMs: 1, pausedAt: 0 }

export function beginEvent(key: number, durationMin: number, scale: number, elapsedMin = 0, now = Date.now()): void {
  st.key = key
  st.durMs = Math.max(1, eventRealSeconds(durationMin, scale) * 1000)
  st.startMs = now - eventRealSeconds(elapsedMin, scale) * 1000
  st.pausedAt = 0
}

export function pauseEvent(now = Date.now()): void {
  if (!st.pausedAt) st.pausedAt = now
}

export function resumeEvent(now = Date.now()): void {
  if (st.pausedAt) {
    st.startMs += now - st.pausedAt
    st.pausedAt = 0
  }
}

/** 0..1 */
export function getEventProgress(now = Date.now()): number {
  const t = (st.pausedAt || now) - st.startMs
  return t <= 0 ? 0 : t >= st.durMs ? 1 : t / st.durMs
}

export const getEventKey = (): number => st.key
export const getEventRealMs = (): number => st.durMs
