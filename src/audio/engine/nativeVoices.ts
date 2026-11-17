import type * as ToneNS from 'tone'

/**
 * Дешёвые голоса на «голых» узлах Web Audio — замена PolySynth(FMSynth/AMSynth/Synth).
 *
 * Почему: голос Tone (FMSynth) — это ~20 узлов, из них ~8 ConstantSource (сигналы частоты,
 * расстройки, огибающих, множители), и все они обрабатываются постоянно, пока голос жив
 * (PolySynth держит голоса до сборки мусора). Здесь нота = 2–4 нативных узла, которые
 * создаются на ноту и освобождаются по onended. Звук тот же: схема и огибающие повторяют Tone
 * (attack линейная; decay/release «exponential» = Param.exponentialApproachValueAtTime:
 * setTarget с τ = ln(T+1)/ln(200), с 90 % — линейно в цель), громкости = volume голосов Tone.
 * Совпадение проверяется в лаборатории сравнением с исходным PolySynth.
 */

export interface Adsr {
  attack: number
  decay: number
  sustain: number
  release: number
}

const dbToGain = (db: number): number => Math.pow(10, db / 20)
/** постоянная времени Tone.exponentialApproachValueAtTime */
const tau = (rampTime: number): number => Math.log(rampTime + 1) / Math.log(200)

/** Значение огибающей (как у Tone.Envelope) в момент t для ноты [t0, tRel). */
export function adsrValue(t: number, t0: number, tRel: number, peak: number, e: Adsr): number {
  const held = (x: number): number => {
    if (x <= t0) return 0
    const tA = t0 + e.attack
    if (x < tA) return (peak * (x - t0)) / e.attack
    if (!(e.decay > 0) || e.sustain >= 1) return peak
    const S = peak * e.sustain
    const t9 = tA + 0.9 * e.decay
    if (x < t9) return S + (peak - S) * Math.exp(-(x - tA) / tau(e.decay))
    const v9 = S + (peak - S) * Math.exp(-(0.9 * e.decay) / tau(e.decay))
    const tD = tA + e.decay
    if (x < tD) return v9 + ((S - v9) * (x - t9)) / (tD - t9)
    return S
  }
  if (t < tRel) return held(t)
  const vR = held(tRel)
  const r9 = tRel + 0.9 * e.release
  if (t < r9) return vR * Math.exp(-(t - tRel) / tau(e.release))
  const v9 = vR * Math.exp(-(0.9 * e.release) / tau(e.release))
  const tE = tRel + e.release
  if (t < tE) return v9 - (v9 * (t - r9)) / (tE - r9)
  return 0
}

/**
 * Планирует ADSR на AudioParam (значение до t0 должно быть 0). Возвращает время полного затухания.
 * Точки стыка сегментов ставятся setValueAtTime со значением кривой в этой точке → без скачков.
 */
export function scheduleAdsr(p: AudioParam, t0: number, tRel: number, peak: number, e: Adsr): number {
  const v = (t: number) => adsrValue(t, t0, tRel, peak, e)
  const tA = t0 + e.attack
  p.setValueAtTime(0, t0)
  if (tRel <= tA) {
    p.linearRampToValueAtTime(v(tRel), tRel)
  } else {
    p.linearRampToValueAtTime(peak, tA)
    if (e.decay > 0 && e.sustain < 1) {
      const S = peak * e.sustain
      const t9 = tA + 0.9 * e.decay
      const tD = tA + e.decay
      p.setTargetAtTime(S, tA, tau(e.decay))
      if (tRel <= t9) p.setValueAtTime(v(tRel), tRel)
      else {
        p.setValueAtTime(v(t9), t9)
        if (tRel <= tD) p.linearRampToValueAtTime(v(tRel), tRel)
        else {
          p.linearRampToValueAtTime(S, tD)
          p.setValueAtTime(S, tRel)
        }
      }
    } else p.setValueAtTime(peak, tRel)
  }
  const vR = v(tRel)
  const r9 = tRel + 0.9 * e.release
  const tE = tRel + e.release
  p.setTargetAtTime(0, tRel, tau(e.release))
  p.setValueAtTime(vR * Math.exp(-(0.9 * e.release) / tau(e.release)), r9)
  p.linearRampToValueAtTime(0, tE)
  return tE
}

export type NativeVoiceSpec =
  | {
      /** Tone.FMSynth: carrier (−10 дБ) с частотной модуляцией modulator (−10 дБ) × f × index */
      kind: 'fm'
      carrier: OscillatorType
      modulator: OscillatorType
      harmonicity: number
      modulationIndex: number
      envelope: Adsr
      modulationEnvelope: Adsr
      /** volume голоса, дБ */
      volume: number
    }
  | {
      /** Tone.AMSynth: carrier (−10 дБ) × (1 + modulator(−10 дБ)) / 2 */
      kind: 'am'
      carrier: OscillatorType
      modulator: OscillatorType
      harmonicity: number
      envelope: Adsr
      modulationEnvelope: Adsr
      volume: number
    }
  | {
      /** Tone.Synth: осциллятор + амплитудная огибающая */
      kind: 'plain'
      oscillator: OscillatorType
      envelope: Adsr
      volume: number
    }

interface LiveNote {
  end: number
  nodes: AudioNode[]
  sources: AudioScheduledSourceNode[]
}

/** Полифония на нативных узлах; интерфейс совместим с тем, что MusicEngine использует у PolySynth. */
export class NativePoly {
  maxPolyphony: number
  private live = new Set<LiveNote>()
  private disposed = false
  /** нот сыграно (диагностика) */
  played = 0

  constructor(
    private ctx: ToneNS.BaseContext,
    private dest: ToneNS.ToneAudioNode,
    private spec: NativeVoiceSpec,
    maxPolyphony = 8,
  ) {
    this.maxPolyphony = maxPolyphony
  }

  /** Звучащих нот (от постановки до конца релиза) — как PolySynth.activeVoices. */
  get activeVoices(): number {
    const now = this.ctx.currentTime
    let n = 0
    for (const v of this.live) {
      if (v.end > now) n++
      // страховка: onended не пришёл (контекст был приостановлен) — освобождаем вручную
      else if (v.end < now - 5) this.release(v)
    }
    return n
  }

  /** Как PolySynth.triggerAttackRelease: частота или аккорд, длительность до релиза, время, громкость 0..1. */
  triggerAttackRelease(freq: number | number[], dur: number, time: number, velocity = 1): this {
    if (this.disposed) return this
    const fs = Array.isArray(freq) ? freq : [freq]
    for (const f of fs) if (Number.isFinite(f) && f > 0 && Number.isFinite(time) && dur > 0) this.note(f, dur, time, velocity)
    return this
  }

  private note(f: number, dur: number, t0: number, vel: number): void {
    const raw = this.ctx.rawContext as unknown as BaseAudioContext
    const input = (this.dest as unknown as { input: AudioNode }).input
    const s = this.spec
    const tRel = t0 + dur
    const nodes: AudioNode[] = []
    const sources: AudioScheduledSourceNode[] = []
    const osc = (type: OscillatorType, freqHz: number) => {
      const o = raw.createOscillator()
      o.type = type
      o.frequency.value = freqHz
      nodes.push(o)
      sources.push(o)
      return o
    }
    const gain = (value: number) => {
      const g = raw.createGain()
      g.gain.value = value
      nodes.push(g)
      return g
    }
    const vol = dbToGain(s.volume)
    let end: number
    if (s.kind === 'plain') {
      const o = osc(s.oscillator, f)
      const amp = gain(0)
      end = scheduleAdsr(amp.gain, t0, tRel, vel * vol, s.envelope)
      o.connect(amp)
      amp.connect(input)
      o.start(t0)
      o.stop(end)
    } else if (s.kind === 'fm') {
      const car = osc(s.carrier, f)
      const mod = osc(s.modulator, f * s.harmonicity)
      const depth = gain(0)
      const amp = gain(0)
      // глубина модуляции, Гц = f × index × (выход модулятора: −10 дБ × огибающая × velocity)
      const modEnd = scheduleAdsr(depth.gain, t0, tRel, vel * dbToGain(-10) * f * s.modulationIndex, s.modulationEnvelope)
      end = scheduleAdsr(amp.gain, t0, tRel, vel * dbToGain(-10) * vol, s.envelope)
      mod.connect(depth)
      depth.connect(car.frequency)
      car.connect(amp)
      amp.connect(input)
      car.start(t0)
      mod.start(t0)
      car.stop(end)
      mod.stop(modEnd)
    } else {
      const car = osc(s.carrier, f)
      const mod = osc(s.modulator, f * s.harmonicity)
      // AudioToGain: (x + 1) / 2 → база 0.5 + 0.5 × модулятор
      const am = gain(0.5)
      const depth = gain(0)
      const amp = gain(0)
      const modEnd = scheduleAdsr(depth.gain, t0, tRel, vel * dbToGain(-10) * 0.5, s.modulationEnvelope)
      end = scheduleAdsr(amp.gain, t0, tRel, vel * dbToGain(-10) * vol, s.envelope)
      mod.connect(depth)
      depth.connect(am.gain)
      car.connect(amp)
      amp.connect(am)
      am.connect(input)
      car.start(t0)
      mod.start(t0)
      car.stop(end)
      mod.stop(Math.min(end, modEnd))
    }
    const v: LiveNote = { end, nodes, sources }
    this.live.add(v)
    this.played++
    // последний источник, который остановится, — несущий; по его onended освобождаем ноту
    const carrier = sources[0]
    carrier.onended = () => this.release(v)
    // модулятор (может кончиться раньше несущей) отсоединяется сам — граф не копит «мёртвые» узлы
    for (const src of sources) {
      if (src === carrier) continue
      src.onended = () => {
        try {
          src.disconnect()
        } catch {
          /* уже отключён */
        }
      }
    }
  }

  private release(v: LiveNote): void {
    if (!this.live.delete(v)) return
    for (const n of v.nodes) {
      try {
        n.disconnect()
      } catch {
        /* уже отключён */
      }
    }
  }

  /** узлов Web Audio у звучащих нот сейчас (диагностика) */
  get liveNodes(): number {
    let n = 0
    for (const v of this.live) n += v.nodes.length
    return n
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const now = this.ctx.currentTime
    for (const v of [...this.live]) {
      for (const src of v.sources) {
        try {
          src.stop(now)
        } catch {
          /* ещё не стартовал/уже остановлен */
        }
      }
      this.release(v)
    }
  }
}
