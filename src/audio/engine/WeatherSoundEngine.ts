import type * as ToneNS from 'tone'
import type { WeatherParams } from '../../types'
import type { AudioMixer } from './AudioMixer'
import { NoiseBank, NoiseBurst, type ToneModule, clamp01, daylight, disposeAll, lerp, safe } from './audioUtils'
import { GatedLayer, OutputGate } from './layerGate'

export interface WeatherWorld {
  weather: WeatherParams
  minutes: number
  /** ambience.birds текущей локации 0..1 */
  birds: number
  /** ambience.indoor 0..1 (приглушение) */
  indoor: number
}

const SMOOTH = 0.6

/** Процедурная погода: дождь, ветер, снег (+скрип), гром, птицы. update() ~5 Гц. */
export class WeatherSoundEngine {
  private nodes: Array<{ dispose: () => unknown } | null> = []
  private disposed = false
  private ctx: ToneNS.BaseContext
  private bank: NoiseBank

  private muffle!: ToneNS.Filter
  private rainHigh!: GatedLayer
  private rainLow!: GatedLayer
  private wind!: GatedLayer
  private windCentre!: ToneNS.Signal<'frequency'>
  private gustLfo!: ToneNS.LFO
  private snowHush!: GatedLayer
  private drops!: NoiseBurst
  private thunder!: NoiseBurst
  private thunderLow!: NoiseBurst
  private crunch!: NoiseBurst
  private bird!: ToneNS.Synth
  private birdPan!: ToneNS.Panner
  private birdBusyUntil = 0
  private birdGate!: OutputGate

  constructor(private T: ToneModule, private mixer: AudioMixer) {
    this.ctx = mixer.context
    this.bank = new NoiseBank(T)
  }

  init(): void {
    const T = this.T
    const track = <N extends { dispose: () => unknown }>(n: N): N => {
      this.nodes.push(n)
      return n
    }
    const b = this.bank
    this.muffle = track(new T.Filter({ type: 'lowpass', frequency: 16000, Q: 0.4 }))
    this.muffle.connect(this.mixer.weatherIn)
    const gated = (g: ToneNS.Gain) => new GatedLayer(this.ctx, g, this.muffle)

    // дождь: шипение + низкий «шум капель по крышам»
    const rainHp = track(new T.Filter({ type: 'highpass', frequency: 700 }))
    const rainLp = track(new T.Filter({ type: 'lowpass', frequency: 6500 }))
    const rainHighG = track(new T.Gain(0))
    b.get('pink').chain(rainHp, rainLp, rainHighG)
    this.rainHigh = gated(rainHighG)
    const rainLowLp = track(new T.Filter({ type: 'lowpass', frequency: 1200 }))
    const rainLowG = track(new T.Gain(0))
    b.get('brown').chain(rainLowLp, rainLowG)
    this.rainLow = gated(rainLowG)
    this.drops = track(new NoiseBurst(T, { noise: 'white', filter: 'bandpass', freq: 4200, q: 1.0, attack: 0.004, release: 0.04, gain: 0.25, voices: 3 }, b))
    this.drops.connectGated(rainHighG)

    // ветер: полосовой шум; частота = центр (плавная рампа) × медленный LFO 0.6..1.5
    const windFilter = track(new T.Filter({ type: 'bandpass', frequency: 0, Q: 0.7 }))
    this.windCentre = track(new T.Signal({ value: 400, units: 'frequency' }))
    const windLfo = track(new T.LFO({ frequency: 0.07, min: 0.6, max: 1.5 }))
    const windMul = track(new T.Multiply(1))
    this.windCentre.connect(windMul)
    windLfo.connect(windMul.factor)
    windMul.connect(windFilter.frequency)
    windLfo.start()
    const gustGain = track(new T.Gain(0.7))
    this.gustLfo = track(new T.LFO({ frequency: 0.13, min: 0.45, max: 1 }))
    this.gustLfo.connect(gustGain.gain)
    this.gustLfo.start()
    const windG = track(new T.Gain(0))
    b.get('pink').chain(windFilter, gustGain, windG)
    this.wind = gated(windG)

    // снег: приглушённый «шёпот» воздуха
    const snowLp = track(new T.Filter({ type: 'lowpass', frequency: 420 }))
    const snowG = track(new T.Gain(0))
    b.get('brown').chain(snowLp, snowG)
    this.snowHush = gated(snowG)
    this.crunch = track(new NoiseBurst(T, { noise: 'white', filter: 'bandpass', freq: 2400, q: 1.0, attack: 0.006, release: 0.08, gain: 0.3, voices: 3 }, b))
    this.crunch.connectGated(this.muffle)

    // гром (2 голоса — две молнии подряд не обрывают раскат)
    this.thunder = track(new NoiseBurst(T, { noise: 'brown', filter: 'lowpass', freq: 500, attack: 0.25, release: 4.5, gain: 1.1, voices: 2 }, b))
    this.thunder.connectGated(this.muffle)
    this.thunderLow = track(new NoiseBurst(T, { noise: 'brown', filter: 'lowpass', freq: 140, attack: 0.4, release: 5.5, gain: 1.2, voices: 2 }, b))
    this.thunderLow.connectGated(this.muffle)

    // птицы
    this.bird = track(new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.012, decay: 0.05, sustain: 0, release: 0.05 }, portamento: 0.025, volume: -8 }))
    this.birdPan = track(new T.Panner(0))
    const birdGain = track(new T.Gain(0.3))
    this.bird.chain(this.birdPan, birdGain)
    // птицы поют редко: синт подключён к шине только на время трели
    this.birdGate = new OutputGate(this.ctx, birdGain, this.muffle)
  }

  /** Плавное обновление параметров (вызывать ~5 Гц). */
  update(w: WeatherWorld): void {
    if (this.disposed) return
    const { weather: p } = w
    const rain = clamp01(p.rain)
    const wind = clamp01(Math.max(p.wind, p.storm * 0.8))
    const snow = clamp01(p.snow)
    const hushDamp = 1 - snow * 0.4 // снег глушит шипение дождя

    this.rainHigh.set(Math.pow(rain, 1.2) * 0.5 * hushDamp, SMOOTH)
    this.rainLow.set(Math.max(0, rain - 0.35) * 0.8, SMOOTH)
    this.wind.set(Math.pow(wind, 1.3) * 0.55 + snow * 0.05, SMOOTH)
    safe(() => this.windCentre.rampTo(lerp(260, 900, wind), 2))
    safe(() => this.gustLfo.frequency.rampTo(0.08 + wind * 0.25, 2))
    this.snowHush.set(snow * 0.3 * (1 - rain * 0.5), SMOOTH)
    safe(() => this.muffle.frequency.rampTo(lerp(16000, 650, clamp01(w.indoor)) * (1 - clamp01(p.fog) * 0.25), 1))

    const now = this.ctx.now()
    // капли поверх лёгкого дождя
    if (rain > 0.05 && rain < 0.7 && Math.random() < 0.55 * rain + 0.1) {
      this.drops.hit(now + 0.02 + Math.random() * 0.15, 0.25 + Math.random() * 0.5, 0.004, 3000 + Math.random() * 2000)
    }
    // птицы: днём, в ясную погоду, по ambience.birds
    const clear = clamp01(1 - p.cloud * 0.5 - rain * 1.6 - p.storm - snow * 0.9 - p.fog * 0.3 - wind * 0.4)
    const density = clamp01(w.birds) * daylight(w.minutes) * clear
    if (density > 0.02 && Math.random() < density * 0.1) this.chirp(now + 0.05)
  }

  private chirp(at: number): void {
    const start = Math.max(at, this.birdBusyUntil + 0.05)
    const notes = 2 + Math.floor(Math.random() * 4)
    const f = 2000 + Math.random() * 1800
    let t = start
    safe(() => this.birdPan.pan.linearRampToValueAtTime(Math.random() * 1.6 - 0.8, start))
    for (let i = 0; i < notes; i++) {
      const freq = f * (1 + (Math.random() - 0.4) * 0.35)
      const at2 = t
      safe(() => this.bird.triggerAttackRelease(freq, 0.045, at2, 0.35 + Math.random() * 0.4))
      t += 0.075 + Math.random() * 0.05
    }
    this.birdBusyUntil = t
    this.birdGate.hold(t + 0.2)
  }

  /** Гром по молнии: задержка зависит от distance 0..1. */
  onLightning(distance: number): void {
    if (this.disposed) return
    const d = clamp01(distance)
    const t = this.ctx.now() + 0.2 + d * 5
    const vel = 1 - d * 0.65
    this.thunder.hit(t, vel, 1.2 + (1 - d) * 1.5, 700 - d * 400)
    this.thunderLow.hit(t + 0.1, vel * 0.9, 1.8, 160)
  }

  /** Скрип шагов по снегу. */
  onFootstep(surface: 'asphalt' | 'snow' | 'grass' | 'floor'): void {
    if (this.disposed || surface !== 'snow') return
    const t = this.ctx.now() + 0.01
    this.crunch.hit(t, 0.4 + Math.random() * 0.3, 0.015, 1800 + Math.random() * 1400)
    this.crunch.hit(t + 0.03, 0.25 + Math.random() * 0.25, 0.01, 2200 + Math.random() * 1200)
  }

  nodeCount(): number {
    return this.nodes.length + this.bank.size
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const l of [this.rainHigh, this.rainLow, this.wind, this.snowHush]) l?.dispose()
    this.birdGate?.dispose()
    disposeAll(this.nodes)
    this.nodes = []
    this.bank.dispose()
  }
}
