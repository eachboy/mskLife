import { describe, expect, it } from 'vitest'
import { reverbImpulse } from './MusicEngine'
import { type Adsr, NativePoly, adsrValue, scheduleAdsr } from './nativeVoices'

const RH: Adsr = { attack: 0.012, decay: 1.4, sustain: 0.18, release: 0.9 }
const PAD: Adsr = { attack: 1.4, decay: 1, sustain: 0.8, release: 1.4 }

/** AudioParam, записывающий события автоматизации. */
function recParam() {
  const ev: Array<{ kind: string; v: number; t: number }> = []
  const p = {
    setValueAtTime: (v: number, t: number) => ev.push({ kind: 'set', v, t }),
    linearRampToValueAtTime: (v: number, t: number) => ev.push({ kind: 'lin', v, t }),
    setTargetAtTime: (v: number, t: number) => ev.push({ kind: 'target', v, t }),
  }
  return { p: p as unknown as AudioParam, ev }
}

describe('nativeVoices — огибающая как у Tone.Envelope', () => {
  for (const [name, env, dur] of [
    ['rhodes, релиз после decay', RH, 2.2],
    ['rhodes, релиз внутри decay', RH, 0.5],
    ['pad, релиз внутри атаки', PAD, 0.8],
    ['pad, длинная нота', PAD, 4],
  ] as const) {
    it(`${name}: без скачков, 0 в начале и в конце`, () => {
      const t0 = 1
      const tRel = t0 + dur
      const v = (t: number) => adsrValue(t, t0, tRel, 0.7, env)
      expect(v(t0)).toBe(0)
      expect(v(tRel + env.release + 1e-6)).toBe(0)
      // непрерывность: соседние точки с шагом 0.1 мс отличаются мало (нет разрывов на стыках сегментов)
      let maxJump = 0
      for (let t = t0; t < tRel + env.release + 0.01; t += 1e-4) maxJump = Math.max(maxJump, Math.abs(v(t + 1e-4) - v(t)))
      expect(maxJump).toBeLessThan(0.7 * (1e-4 / env.attack) + 1e-3)
      // события автоматизации: время не убывает, значения конечны и совпадают с кривой
      const { p, ev } = recParam()
      const end = scheduleAdsr(p, t0, tRel, 0.7, env)
      expect(end).toBeCloseTo(tRel + env.release, 9)
      for (let i = 1; i < ev.length; i++) expect(ev[i].t).toBeGreaterThanOrEqual(ev[i - 1].t)
      for (const e of ev) {
        expect(Number.isFinite(e.v)).toBe(true)
        if (e.kind !== 'target') expect(Math.abs(e.v - v(e.t - 1e-9))).toBeLessThan(1e-6)
      }
    })
  }

  it('пик огибающей = velocity × громкость в конце атаки', () => {
    expect(adsrValue(1.012, 1, 3, 0.5, RH)).toBeCloseTo(0.5, 6)
  })
})

describe('NativePoly — голоса создаются на ноту и освобождаются', () => {
  function fake() {
    const ctx = { currentTime: 0 }
    let made = 0
    let disconnected = 0
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} })
    const node = () => {
      made++
      return { type: '', frequency: param(), gain: param(), connect() {}, disconnect: () => void disconnected++, start() {}, stop() {}, onended: null as null | (() => void) }
    }
    const raw = { createOscillator: node, createGain: node }
    const dest = { input: {} }
    const poly = new NativePoly({ ...ctx, rawContext: raw, get currentTime() { return ctx.currentTime } } as never, dest as never, { kind: 'fm', carrier: 'sine', modulator: 'sine', harmonicity: 3, modulationIndex: 1.1, envelope: RH, modulationEnvelope: RH, volume: -15 }, 4)
    return { ctx, poly, stats: () => ({ made, disconnected }) }
  }

  it('activeVoices считает звучащие ноты; по окончании (страховка без onended) узлы отключаются', () => {
    const { ctx, poly, stats } = fake()
    poly.triggerAttackRelease([220, 277, 330], 1, 0.1, 0.6)
    expect(poly.activeVoices).toBe(3)
    expect(stats().made).toBe(12) // FM: 2 осциллятора + 2 гейна на ноту
    ctx.currentTime = 2.1 // 0.1 + 1 + 0.9 релиз — затихли
    expect(poly.activeVoices).toBe(0)
    ctx.currentTime = 8
    void poly.activeVoices // страховочная очистка
    expect(stats().disconnected).toBe(12)
    expect(poly.liveNodes).toBe(0)
  })

  it('нечисловые параметры игнорируются; после dispose ноты не ставятся', () => {
    const { poly, stats } = fake()
    poly.triggerAttackRelease(Number.NaN, 1, 0, 1)
    poly.triggerAttackRelease(440, 0, 0, 1)
    poly.triggerAttackRelease(440, 1, Number.POSITIVE_INFINITY, 1)
    expect(stats().made).toBe(0)
    poly.triggerAttackRelease(440, 1, 0, 1)
    poly.dispose()
    poly.triggerAttackRelease(440, 1, 0, 1)
    expect(stats().made).toBe(4)
    expect(poly.liveNodes).toBe(0)
  })
})

describe('reverbImpulse — IR реверберации', () => {
  it('обрезан на −60 дБ огибающей (короче 2.42 с исходного Tone.Reverb), стерео, конечен', () => {
    const ir = reverbImpulse(48000, 1)
    expect(ir).toHaveLength(2)
    const sec = ir[0].length / 48000
    expect(sec).toBeGreaterThan(1.5)
    expect(sec).toBeLessThan(1.7)
    // хвост последних 10 мс по сравнению с началом — ниже −55 дБ
    const rms = (x: Float32Array, a: number, b: number) => Math.sqrt(x.slice(a, b).reduce((s, v) => s + v * v, 0) / (b - a))
    const head = rms(ir[0], 960, 960 + 480)
    const tail = rms(ir[0], ir[0].length - 480, ir[0].length)
    expect(20 * Math.log10(tail / head)).toBeLessThan(-55)
    expect(ir[0].every(Number.isFinite)).toBe(true)
  })
})
