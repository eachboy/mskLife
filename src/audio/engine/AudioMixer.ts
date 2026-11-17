import type * as ToneNS from 'tone'
import { type ToneModule, clamp01, disposeAll, safe } from './audioUtils'

export interface MixerLevels {
  music: number
  city: number
  weather: number
  cityMuted: boolean
  weatherMuted: boolean
  /** общая громкость 0..1 (по умолчанию 1) */
  master?: number
}

export type BusId = 'music' | 'city' | 'weather' | 'master' | 'preLimiter'

/** время сглаживания громкостей, с (рампы, а не скачки → без щелчков) */
const RAMP = 0.25
/** срез верха мастера: тёплый, без «песка» */
export const MASTER_LP_HZ = 6800
/** линейная громкость 0..1 → амплитуда (перцептивная кривая) */
const curve = (v: number): number => Math.pow(clamp01(v), 1.6)
/** порог мягкого ограничителя: до него сигнал проходит линейно */
export const SOFT_CLIP_KNEE = 0.7

/** «Вид сверху» (карта открыта): срез верха и подрезка громкости только на шинах города и погоды. */
export const MAP_OVERVIEW_LP_HZ = 650
export const MAP_OPEN_LP_HZ = 18000
export const MAP_OVERVIEW_TRIM_DB = -4
/** постоянная времени setTargetAtTime, с (≈95% пути за 3·τ ≈ 1 с) */
export const MAP_OVERVIEW_TAU = 0.35

const dbToLinear = (db: number): number => Math.pow(10, db / 20)

/** Цели «вид сверху»: фильтр и подрезка шин города/погоды. Музыка сюда не входит — остаётся чистой. */
export function mapOverviewTargets(isMapOpen: boolean): { cutoffHz: number; trim: number } {
  return isMapOpen
    ? { cutoffHz: MAP_OVERVIEW_LP_HZ, trim: dbToLinear(MAP_OVERVIEW_TRIM_DB) }
    : { cutoffHz: MAP_OPEN_LP_HZ, trim: 1 }
}

/**
 * Микшер MOSCOW LIFE.
 *
 *   music bus → musicIn(gain) → [music analyser] ┐
 *   city bus  → cityIn(gain)  → [city analyser]  ├→ sum(0.9) → comp → warmth LP → [preLimiter analyser]
 *   weather   → weatherIn     → [weather an.]    ┘      → soft-clip → master gain → [master analyser] → out
 *
 * Анализаторы — отводы (не в разрыве цепи): визуализатор и диагностика читают реальный сигнал.
 * Контекст создаётся здесь (или берётся текущий — offline-тесты) и закрывается только в dispose().
 * Скрытие страницы контекст НЕ приостанавливает (фоновое воспроизведение).
 */
export class AudioMixer {
  readonly musicIn: ToneNS.Gain
  readonly cityIn: ToneNS.Gain
  readonly weatherIn: ToneNS.Gain
  readonly context: ToneNS.BaseContext
  private sum: ToneNS.Gain
  /** «вид сверху»: lowpass + подрезка на шинах города и погоды (музыка в обход) */
  private cityLp: ToneNS.Filter
  private weatherLp: ToneNS.Filter
  private cityTrim: ToneNS.Gain
  private weatherTrim: ToneNS.Gain
  private warmth: ToneNS.Filter
  private comp: ToneNS.Compressor
  private limiter: ToneNS.WaveShaper
  private masterGain: ToneNS.Gain
  private analysers: Record<BusId, AnalyserNode>
  private ownsContext: boolean
  private disposed = false

  constructor(private T: ToneModule, opts: { useCurrentContext?: boolean } = {}) {
    this.ownsContext = !opts.useCurrentContext
    if (opts.useCurrentContext) {
      this.context = T.getContext()
    } else {
      // 'playback' — крупный буфер вывода: меньше риск недогрузки при нагрузке на главный поток.
      // lookAhead 0.3 с: события Transport планируются заранее, джиттер UI не влияет на ритм.
      this.context = new T.Context({ latencyHint: 'playback', lookAhead: 0.3, updateInterval: 0.05 })
      // B-11: disposeOld=true закрывает контекст Tone «по умолчанию», если он успел создаться
      // (сигнатура tone 15.1.22: setContext(context, disposeOld = false)); сбой его закрытия не должен ломать старт
      try {
        T.setContext(this.context, true)
      } catch {
        T.setContext(this.context)
      }
    }
    const c = { context: this.context }
    this.musicIn = new T.Gain({ ...c, gain: 0 })
    this.cityIn = new T.Gain({ ...c, gain: 0 })
    this.weatherIn = new T.Gain({ ...c, gain: 0 })
    this.sum = new T.Gain({ ...c, gain: 0.9 })
    const lp = () => new T.Filter({ ...c, type: 'lowpass', frequency: MAP_OPEN_LP_HZ, Q: 0.5, rolloff: -12 })
    this.cityLp = lp()
    this.weatherLp = lp()
    this.cityTrim = new T.Gain({ ...c, gain: 1 })
    this.weatherTrim = new T.Gain({ ...c, gain: 1 })
    this.comp = new T.Compressor({ ...c, threshold: -16, ratio: 2, attack: 0.025, release: 0.4, knee: 10 })
    this.warmth = new T.Filter({ ...c, type: 'lowpass', frequency: MASTER_LP_HZ, Q: 0.5, rolloff: -12 })
    // Без DynamicsCompressor-лимитера (в Chrome авто-makeup «качает» усиление).
    // Страховка — прозрачный soft-clip: линейно до 0.7, мягкое насыщение выше, |y| < 1.
    this.limiter = new T.WaveShaper({
      ...c,
      mapping: (x: number) => {
        const a = Math.abs(x)
        if (a <= SOFT_CLIP_KNEE) return x
        return Math.sign(x) * (SOFT_CLIP_KNEE + (1 - SOFT_CLIP_KNEE) * Math.tanh((a - SOFT_CLIP_KNEE) / (1 - SOFT_CLIP_KNEE)))
      },
      length: 4096,
    } as never)
    this.limiter.oversample = '2x'
    this.masterGain = new T.Gain({ ...c, gain: 1 })

    const raw = this.context.rawContext as BaseAudioContext
    const mk = (fft: number) => {
      const a = raw.createAnalyser()
      a.fftSize = fft
      a.smoothingTimeConstant = 0.8
      a.minDecibels = -90
      a.maxDecibels = -10
      return a
    }
    this.analysers = { music: mk(2048), city: mk(1024), weather: mk(1024), preLimiter: mk(2048), master: mk(2048) }

    this.musicIn.connect(this.sum)
    this.cityIn.chain(this.cityLp, this.cityTrim, this.sum)
    this.weatherIn.chain(this.weatherLp, this.weatherTrim, this.sum)
    this.musicIn.connect(this.analysers.music)
    this.cityIn.connect(this.analysers.city)
    this.weatherIn.connect(this.analysers.weather)
    this.sum.chain(this.comp, this.warmth, this.limiter, this.masterGain)
    this.warmth.connect(this.analysers.preLimiter)
    this.masterGain.connect(this.analysers.master)
    this.masterGain.toDestination()
  }

  /** Вызывать после жеста пользователя. */
  async start(): Promise<void> {
    await this.T.start()
    await this.resume()
  }

  /** Плавно применяет громкости (рампы — без щелчков). */
  setLevels(l: MixerLevels): void {
    if (this.disposed) return
    this.musicIn.gain.rampTo(curve(l.music), RAMP)
    this.cityIn.gain.rampTo(l.cityMuted ? 0 : curve(l.city), RAMP)
    this.weatherIn.gain.rampTo(l.weatherMuted ? 0 : curve(l.weather), RAMP)
    this.masterGain.gain.rampTo(curve(l.master ?? 1), RAMP)
  }

  /**
   * «Вид с высоты птичьего полёта»: пока открыта полноэкранная карта, шины города и погоды плавно
   * уходят в lowpass 650 Гц и на −4 дБ; при возврате в локацию фильтр открывается до 18 кГц.
   * Только setTargetAtTime от currentTime (без cancel — иначе скачок значения = щелчок);
   * музыкальная шина не затрагивается.
   */
  setMapOverviewMode(isMapOpen: boolean): void {
    if (this.disposed) return
    const { cutoffHz, trim } = mapOverviewTargets(isMapOpen)
    const t = this.context.currentTime
    for (const f of [this.cityLp, this.weatherLp]) safe(() => f.frequency.setTargetAtTime(cutoffHz, t, MAP_OVERVIEW_TAU))
    for (const g of [this.cityTrim, this.weatherTrim]) safe(() => g.gain.setTargetAtTime(trim, t, MAP_OVERVIEW_TAU))
  }

  /** Возобновить контекст (после блокировки/прерывания). Скрытие страницы сюда не ведёт. */
  async resume(): Promise<void> {
    const raw = this.context.rawContext as AudioContext
    if (raw.state !== 'running' && typeof raw.resume === 'function') {
      try {
        await raw.resume()
      } catch {
        /* нужен жест пользователя — повторим по следующему */
      }
    }
  }

  analyser(bus: BusId): AnalyserNode {
    return this.analysers[bus]
  }

  /** только для диагностики */
  debugNodes() {
    return { cityLp: this.cityLp, weatherLp: this.weatherLp, cityTrim: this.cityTrim, weatherTrim: this.weatherTrim, sum: this.sum, comp: this.comp, warmth: this.warmth, limiter: this.limiter, master: this.masterGain, musicIn: this.musicIn, cityIn: this.cityIn, weatherIn: this.weatherIn }
  }

  get state(): string {
    return (this.context.rawContext as BaseAudioContext).state
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    safe(() => this.context.transport.stop().cancel(0))
    for (const a of Object.values(this.analysers)) safe(() => a.disconnect())
    disposeAll([this.musicIn, this.cityIn, this.weatherIn, this.cityLp, this.weatherLp, this.cityTrim, this.weatherTrim, this.sum, this.comp, this.warmth, this.limiter, this.masterGain])
    if (this.ownsContext) safe(() => void this.context.dispose())
  }
}
