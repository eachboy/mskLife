import { describe, expect, it } from 'vitest'
import { detectClicks, signalStats } from './signalStats'

const SR = 48000
const sine = (sec: number, f: number, amp = 0.5) => {
  const x = new Float32Array(Math.round(sec * SR))
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * f * i) / SR)
  return x
}
let seed = 7
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff) * 2 - 1

describe('detectClicks', () => {
  it('smooth sine has no clicks', () => {
    expect(detectClicks(sine(1, 220), SR)).toEqual([])
  })
  it('hard cut of a sine is a click', () => {
    const x = sine(1, 220)
    x.fill(0, SR / 2 + 37) // обрыв не в нуле
    expect(detectClicks(x, SR).length).toBeGreaterThanOrEqual(1)
  })
  it('5 ms fade-out is not a click', () => {
    const x = sine(1, 220)
    const s = SR / 2
    const n = Math.round(0.005 * SR)
    for (let i = 0; i < n; i++) x[s + i] *= 1 - i / n
    x.fill(0, s + n)
    expect(detectClicks(x, SR)).toEqual([])
  })
  it('instant gain jump on a running tone is a click', () => {
    const x = sine(1, 330, 0.1)
    for (let i = SR / 2 + 11; i < x.length; i++) x[i] *= 6
    expect(detectClicks(x, SR).length).toBeGreaterThanOrEqual(1)
  })
  it('steady white noise is not reported as clicks', () => {
    const x = new Float32Array(SR)
    for (let i = 0; i < x.length; i++) x[i] = rnd() * 0.2
    expect(detectClicks(x, SR).length).toBeLessThan(3)
  })
})

describe('signalStats', () => {
  it('measures peak, rms, clipping and silence', () => {
    const x = new Float32Array(SR * 2)
    x.set(sine(1, 440, 1.2), 0) // перегруз в первой секунде
    const st = signalStats([x], SR)
    expect(st.peak).toBeGreaterThan(1)
    expect(st.clipped).toBeGreaterThan(0)
    expect(st.maxSilence).toBeGreaterThan(0.9)
    expect(st.nonFinite).toBe(0)
  })
  it('sine rms ≈ amp/√2', () => {
    const st = signalStats([sine(1, 440, 0.5)], SR)
    expect(st.rms).toBeCloseTo(0.5 / Math.SQRT2, 2)
    expect(st.clicks).toBe(0)
  })
})
