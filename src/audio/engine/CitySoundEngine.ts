import type * as ToneNS from 'tone'
import type { AmbienceProfile } from '../../types'
import type { AudioMixer } from './AudioMixer'
import { NoiseBank, NoiseBurst, type ToneModule, clamp01, disposeAll, lerp, safe } from './audioUtils'
import { GatedLayer } from './layerGate'

const FADE = 1.8 // секунд кроссфейда слоёв при смене локации
/** уровень эмбиента в середине перехода между сценами */
const TRANSITION_DIP = 0.55

type LayerId = 'traffic' | 'crowd' | 'water' | 'metro' | 'cafe' | 'office'

/**
 * Городское окружение по AmbienceProfile: трафик, толпа, вода, метро, кафе, офис.
 * Слои плавно кроссфейдятся и отключаются от шины, когда не нужны (экономия аудиопотока);
 * indoor приглушает высокие. Птицы — в WeatherSoundEngine.
 */
export class CitySoundEngine {
  private nodes: Array<{ dispose: () => unknown } | null> = []
  private disposed = false
  private profile: AmbienceProfile | null = null
  private ctx: ToneNS.BaseContext
  private bank: NoiseBank

  private muffle!: ToneNS.Filter
  /** общий «провал» эмбиента на время кинематографичного перехода между сценами */
  private xfade!: ToneNS.Gain
  /** 0..1: насколько приглушить свой стук колёс (поезд ведёт TravelSoundEngine) */
  private wheelDuck = 1
  private layers = {} as Record<LayerId, GatedLayer>
  private pass!: NoiseBurst
  private passPan!: ToneNS.Panner
  private wheel!: NoiseBurst
  private hiss!: NoiseBurst
  private steam!: NoiseBurst
  private key!: NoiseBurst
  private clink!: ToneNS.PolySynth

  private passBusyUntil = 0
  private nextWheel = 0
  private nextHiss = 0
  private nextSteam = 0
  private nextClink = 0
  private nextKey = 0

  constructor(private T: ToneModule, private mixer: AudioMixer) {
    this.ctx = mixer.context
    this.bank = new NoiseBank(T)
  }

  init(): void {
    const T = this.T
    const b = this.bank
    const track = <N extends { dispose: () => unknown }>(n: N): N => {
      this.nodes.push(n)
      return n
    }
    this.muffle = track(new T.Filter({ type: 'lowpass', frequency: 16000, Q: 0.4 }))
    this.xfade = track(new T.Gain(1))
    this.muffle.chain(this.xfade, this.mixer.cityIn)
    const layer = (id: LayerId): ToneNS.Gain => {
      const g = track(new T.Gain(0))
      this.layers[id] = new GatedLayer(this.ctx, g, this.muffle)
      return g
    }

    // трафик: низкий гул (+ проезды — отдельно, всегда подключены: короткие события)
    const trafficLp = track(new T.Filter({ type: 'lowpass', frequency: 380 }))
    b.get('brown').chain(trafficLp, layer('traffic'))
    this.pass = track(new NoiseBurst(T, { noise: 'pink', filter: 'bandpass', freq: 600, q: 0.8, attack: 1.4, release: 1.8, gain: 0.8, voices: 2 }, b))
    this.passPan = track(new T.Panner(0))
    this.pass.connectGated(this.passPan)
    this.passPan.connect(this.muffle)

    // толпа: формантный шум + дрожащая модуляция («бормотание»)
    this.formants(b.get('pink'), layer('crowd'), [[550, 5], [1150, 6], [2400, 4]], [0.7, 1.1, 0.45], track)

    // вода
    const waterBp = track(new T.Filter({ type: 'bandpass', frequency: 1700, Q: 0.35 }))
    const waterLfo = track(new T.LFO({ frequency: 0.27, min: 1100, max: 2400 }))
    waterLfo.connect(waterBp.frequency)
    waterLfo.start()
    b.get('white').chain(waterBp, layer('water'))

    // метро: гул + стук колёс + шипение дверей. Гул — синус + треугольник вместо пилы
    // (пила 58 Гц давала алиасинг-гармоники), фильтр всё равно режет выше 160 Гц.
    const metro = layer('metro')
    const humLp = track(new T.Filter({ type: 'lowpass', frequency: 170 }))
    b.get('brown').chain(humLp, metro)
    const humOsc = track(new T.Oscillator({ frequency: 58, type: 'triangle', volume: -22 }))
    const humOscLp = track(new T.Filter({ type: 'lowpass', frequency: 160 }))
    humOsc.chain(humOscLp, metro)
    humOsc.start()
    this.wheel = track(new NoiseBurst(T, { noise: 'brown', filter: 'bandpass', freq: 260, q: 1.2, attack: 0.008, release: 0.1, gain: 1.2, voices: 3 }, b))
    this.wheel.connectGated(metro)
    this.hiss = track(new NoiseBurst(T, { noise: 'white', filter: 'bandpass', freq: 4000, q: 0.4, attack: 0.12, release: 0.9, gain: 0.4, voices: 2 }, b))
    this.hiss.connectGated(metro)

    // кафе: тихий говор + кофемашина + звон
    const cafe = layer('cafe')
    this.formants(b.get('pink'), cafe, [[450, 5], [900, 6], [1800, 4]], [0.6, 0.9, 0.5], track)
    this.steam = track(new NoiseBurst(T, { noise: 'white', filter: 'bandpass', freq: 4000, q: 0.5, attack: 0.15, release: 0.8, gain: 0.4, voices: 2 }, b))
    this.steam.connectGated(cafe)
    this.clink = track(new T.PolySynth(T.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.004, decay: 0.18, sustain: 0, release: 0.12 }, volume: -24 } as never))
    this.clink.maxPolyphony = 4
    this.clink.connect(cafe)

    // офис: вентиляция + клавиши
    const office = layer('office')
    const airBp = track(new T.Filter({ type: 'bandpass', frequency: 600, Q: 0.4 }))
    b.get('pink').chain(airBp, office)
    this.key = track(new NoiseBurst(T, { noise: 'white', filter: 'bandpass', freq: 2800, q: 1.0, attack: 0.004, release: 0.03, gain: 0.3, voices: 3 }, b))
    this.key.connectGated(office)
  }

  private formants(
    src: ToneNS.ToneAudioNode,
    out: ToneNS.Gain,
    bands: Array<[number, number]>,
    levels: number[],
    track: <N extends { dispose: () => unknown }>(n: N) => N,
  ): void {
    const T = this.T
    bands.forEach(([f, q], i) => {
      const bp = track(new T.Filter({ type: 'bandpass', frequency: f, Q: q }))
      const g = track(new T.Gain(levels[i]))
      const lfo = track(new T.LFO({ frequency: 2.1 + i * 1.3 + Math.random(), min: levels[i] * 0.2, max: levels[i] * 1.2 }))
      lfo.connect(g.gain)
      lfo.start()
      src.connect(bp)
      bp.chain(g, out)
    })
  }

  /** Задать профиль локации (плавный кроссфейд слоёв). */
  setAmbience(a: AmbienceProfile): void {
    if (this.disposed) return
    this.profile = a
    const L = this.layers
    L.traffic.set(Math.pow(clamp01(a.traffic), 1.1) * 0.55, FADE)
    L.crowd.set(clamp01(a.crowd) * 0.5, FADE)
    L.water.set(clamp01(a.water) * 0.28, FADE)
    L.metro.set(clamp01(a.metro) * 0.6, FADE)
    L.cafe.set(clamp01(a.cafe) * 0.5, FADE)
    L.office.set(clamp01(a.office) * 0.3, FADE)
    safe(() => this.muffle.frequency.rampTo(lerp(16000, 900, clamp01(a.indoor)), FADE))
  }

  /**
   * Начало перехода между сценами (занавес): эмбиент плавно проседает, пока меняется картинка.
   * Сам кроссфейд слоёв — в setAmbience() новой локации, затем endTransition() возвращает уровень.
   */
  beginTransition(fade = 0.6): void {
    if (this.disposed) return
    safe(() => this.xfade.gain.linearRampTo(TRANSITION_DIP, fade))
  }

  endTransition(fade = FADE): void {
    if (this.disposed) return
    safe(() => this.xfade.gain.linearRampTo(1, fade))
  }

  /** Поезд рядом/мы в вагоне (0..1): свой постоянный стук колёс приглушаем — его ведёт travel-движок. */
  setTrainPresence(p: number): void {
    this.wheelDuck = 1 - clamp01(p)
  }

  /** Проезд транспорта (eventBus 'vehicle-pass'). */
  onVehiclePass(kind: 'car' | 'bus' | 'tram' | 'taxi' | 'metro' | 'bike'): void {
    const a = this.profile
    if (this.disposed || !a) return
    const vol = kind === 'metro' ? a.metro : a.traffic
    if (vol < 0.03) return
    const heavy = kind === 'bus' || kind === 'tram' || kind === 'metro'
    const t = this.ctx.now() + 0.02
    const f = heavy ? 380 : kind === 'bike' ? 1400 : 700
    const side = Math.random() < 0.5 ? -0.8 : 0.8
    // панораму ведём рампами и не трогаем, пока идёт предыдущий проезд
    if (t > this.passBusyUntil) {
      safe(() => this.passPan.pan.linearRampToValueAtTime(side, t + 0.05))
      safe(() => this.passPan.pan.linearRampToValueAtTime(-side, t + 3))
      this.passBusyUntil = t + 3.2
    }
    this.pass.hit(t + 0.05, clamp01(vol) * (heavy ? 0.9 : 0.6), heavy ? 1.6 : 0.8, f * (0.8 + Math.random() * 0.5))
  }

  /** ~5 Гц: ритмичные/случайные события слоёв (планируются на 0.4 с вперёд). */
  update(): void {
    const a = this.profile
    if (this.disposed || !a) return
    const now = this.ctx.now()
    const horizon = now + 0.4

    if (a.metro > 0.2) {
      if (this.nextWheel < now) this.nextWheel = now + 0.05
      const duck = this.wheelDuck
      while (this.nextWheel < horizon) {
        const beat = this.nextWheel
        // «та-дах… та-дах» — ритм стыков рельс
        if (duck > 0.05) {
          this.wheel.hit(beat, (0.5 + Math.random() * 0.2) * duck, 0.01)
          this.wheel.hit(beat + 0.14, 0.35 * duck, 0.01)
        }
        this.nextWheel += 0.62
      }
      if (this.nextHiss < now) this.nextHiss = now + 8 + Math.random() * 22
      if (this.nextHiss < horizon) {
        this.hiss.hit(this.nextHiss, a.metro * 0.8, 0.7)
        this.nextHiss += 14 + Math.random() * 30
      }
    }
    if (a.cafe > 0.2) {
      if (this.nextSteam < now) this.nextSteam = now + 6 + Math.random() * 15
      if (this.nextSteam < horizon) {
        this.steam.hit(this.nextSteam, a.cafe * 0.9, 1.4 + Math.random())
        this.nextSteam += 25 + Math.random() * 35
      }
      if (this.nextClink < now) this.nextClink = now + 2 + Math.random() * 8
      if (this.nextClink < horizon) {
        const f = 2400 + Math.random() * 1800
        const t = this.nextClink
        safe(() => this.clink.triggerAttackRelease(f, 0.08, t, 0.6))
        if (Math.random() < 0.5) safe(() => this.clink.triggerAttackRelease(f * 1.5, 0.06, t + 0.07, 0.35))
        this.nextClink += 4 + Math.random() * 14
      }
    }
    if (a.office > 0.2) {
      if (this.nextKey < now) this.nextKey = now + Math.random() * 2
      while (this.nextKey < horizon) {
        const burst = 3 + Math.floor(Math.random() * 8)
        let t = this.nextKey
        for (let i = 0; i < burst; i++) {
          this.key.hit(t, 0.3 + Math.random() * 0.5, 0.004, 2600 + Math.random() * 1600)
          t += 0.09 + Math.random() * 0.12
        }
        this.nextKey = t + 1.5 + Math.random() * 5
      }
    }
  }

  nodeCount(): number {
    return this.nodes.length + this.bank.size
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const l of Object.values(this.layers)) l.dispose()
    disposeAll(this.nodes)
    this.nodes = []
    this.bank.dispose()
  }
}
