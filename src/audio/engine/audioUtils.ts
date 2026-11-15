import type * as ToneNS from 'tone'
import { OutputGate } from './layerGate'

/** Тип модуля tone (только тип — сам модуль грузится динамически). */
export type ToneModule = typeof ToneNS

type Disposable = { dispose: () => unknown }

/** Выполняет вызов, подавляя ошибки Tone (например, нарушение монотонности времени старта). */
export function safe(fn: () => void): void {
  try {
    fn()
  } catch {
    /* ignore */
  }
}

export function disposeAll(nodes: Array<Disposable | null | undefined>): void {
  for (const n of nodes) if (n) safe(() => n.dispose())
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * Коэффициент «дневности» 0..1 (птицы и т.п.): 0 ночью, 1 днём, плавный рассвет/закат.
 */
export function daylight(minutes: number): number {
  const m = ((minutes % 1440) + 1440) % 1440
  const h = m / 60
  if (h < 5 || h >= 21.5) return 0
  if (h < 7.5) return (h - 5) / 2.5
  if (h < 19) return 1
  return 1 - (h - 19) / 2.5
}

/**
 * Общие источники шума на контекст: вместо десятка постоянно крутящихся Noise —
 * по одному на цвет. Экономит аудиопоток (каждый лишний источник считается всегда).
 */
export class NoiseBank {
  private sources = new Map<string, ToneNS.Noise>()
  constructor(private T: ToneModule) {}
  get(color: 'white' | 'pink' | 'brown'): ToneNS.Noise {
    let n = this.sources.get(color)
    if (!n) {
      n = new this.T.Noise(color)
      n.start()
      this.sources.set(color, n)
    }
    return n
  }
  get size(): number {
    return this.sources.size
  }
  dispose(): void {
    disposeAll([...this.sources.values()])
    this.sources.clear()
  }
}

export interface NoiseBurstOptions {
  noise?: 'white' | 'pink' | 'brown'
  filter?: BiquadFilterType
  freq?: number
  q?: number
  attack?: number
  release?: number
  gain?: number
  /** голосов в пуле (перекрывающиеся удары не обрывают друг друга) */
  voices?: number
}

interface BurstVoice {
  filter: ToneNS.Filter
  env: ToneNS.AmplitudeEnvelope
  /** время последнего запланированного старта (для монотонности) */
  lastStart: number
  /** когда голос гарантированно затихнет */
  busyUntil: number
}

/**
 * Шумовой «удар» (хэт, щелчок, капля, гром…) с пулом голосов.
 * Почему пул: у одной огибающей новый удар, запланированный раньше уже стоящего в очереди,
 * отменял его (cancelScheduledValues), а смена частоты фильтра под звучащим хвостом давала
 * щелчок. Здесь каждый удар берёт свободный голос; частота фильтра меняется только у
 * затихшего голоса; времена стартов на голосе строго растут.
 */
export class NoiseBurst {
  readonly output: ToneNS.Gain
  private voices: BurstVoice[] = []
  private attack: number
  private release: number
  /** удары, пропущенные из-за занятости всех голосов */
  skipped = 0

  constructor(T: ToneModule, o: NoiseBurstOptions = {}, bank?: NoiseBank) {
    this.attack = Math.max(0.003, o.attack ?? 0.005)
    this.release = Math.max(0.01, o.release ?? 0.1)
    this.output = new T.Gain(o.gain ?? 1)
    const src = bank ? bank.get(o.noise ?? 'white') : new T.Noise(o.noise ?? 'white').start()
    if (!bank) this.ownSource = src
    const n = Math.max(1, o.voices ?? 3)
    for (let i = 0; i < n; i++) {
      const filter = new T.Filter({ type: (o.filter ?? 'bandpass') as ToneNS.FilterOptions['type'], frequency: o.freq ?? 2000, Q: o.q ?? 0.8 })
      const env = new T.AmplitudeEnvelope({ attack: this.attack, decay: 0.01, sustain: 1, release: this.release, releaseCurve: 'linear' })
      src.connect(filter)
      filter.chain(env, this.output)
      this.voices.push({ filter, env, lastStart: -Infinity, busyUntil: -Infinity })
    }
  }
  private ownSource: ToneNS.Noise | null = null

  private gate: OutputGate | null = null

  /** Постоянное подключение (частые удары: хэты и т.п.). */
  connect(dest: ToneNS.InputNode): this {
    this.output.connect(dest)
    return this
  }

  /**
   * Подключение «по требованию»: выход подключается к dest при ударе и отключается, когда все
   * голоса отзвучали. Простаивающий пул (гром, двери, шаги…) тогда не обрабатывается вовсе.
   * Огибающие в этот момент в нуле — щелчка нет.
   */
  connectGated(dest: ToneNS.InputNode): this {
    this.gate = new OutputGate(this.output.context, this.output, dest)
    return this
  }

  /** подключён ли выход сейчас (для диагностики/тестов) */
  get connected(): boolean {
    return this.gate ? this.gate.active : true
  }

  /** hold — сколько держать после атаки до релиза. */
  hit(time: number, vel = 1, hold = 0.01, freq?: number): void {
    if (!Number.isFinite(time)) return
    // свободный голос с прошлым стартом раньше time; иначе — тот, что освободится раньше всех
    let best: BurstVoice | null = null
    for (const v of this.voices) {
      if (v.lastStart >= time) continue
      if (v.busyUntil <= time) {
        best = v
        break
      }
      if (!best || v.busyUntil < best.busyUntil) best = v
    }
    if (!best || (best.busyUntil > time && freq !== undefined)) {
      // все голоса звучат: перестройка фильтра под хвостом дала бы щелчок — пропускаем удар
      this.skipped++
      return
    }
    const v = best
    const dur = this.attack + Math.max(0, hold)
    safe(() => {
      if (freq !== undefined) v.filter.frequency.setValueAtTime(freq, time)
      v.env.triggerAttackRelease(dur, time, vel)
    })
    v.lastStart = time
    v.busyUntil = time + dur + this.release + 0.005
    this.gate?.hold(v.busyUntil)
  }

  dispose(): void {
    this.gate?.dispose()
    this.gate = null
    for (const v of this.voices) disposeAll([v.filter, v.env])
    disposeAll([this.output, this.ownSource])
    this.voices = []
  }
}
