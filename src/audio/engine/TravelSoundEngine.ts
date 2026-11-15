import type * as ToneNS from 'tone'
import type { TravelMode, TravelPhase, TravelSoundCue } from '../../types'
import type { AudioMixer } from './AudioMixer'
import { NoiseBank, NoiseBurst, type ToneModule, disposeAll, safe } from './audioUtils'
import { GatedLayer, OutputGate } from './layerGate'

/** Фаза путешествия глазами звука (из worldStore.event). duration — реальные секунды фазы. */
export interface TravelSoundInput {
  phase?: TravelPhase | null
  mode?: TravelMode | null
  /** фаза в помещении (метро, вагон, салон) — шаги по полу генерируем сами */
  indoor: boolean
  duration: number
  sounds?: TravelSoundCue[]
}

export type StepSurface = 'asphalt' | 'snow' | 'grass' | 'floor'

export interface TravelSoundOptions {
  /** присутствие поезда 0..1 — городской слой метро приглушает свой стук колёс, чтобы не двоился */
  onTrainPresence?: (presence: number) => void
}

/** Движущийся источник: скорость и «присутствие» (насколько он рядом/мы внутри) идут к целям с ограниченной скоростью. */
interface Mover {
  speed: number
  presence: number
  targetSpeed: number
  targetPresence: number
  accel: number
  decel: number
  fadeIn: number
  fadeOut: number
  /** отложенная смена целей (время контекста) */
  next: { at: number; speed: number; presence: number } | null
}

const mover = (accel: number, decel: number, fadeIn: number, fadeOut: number): Mover => ({
  speed: 0,
  presence: 0,
  targetSpeed: 0,
  targetPresence: 0,
  accel,
  decel,
  fadeIn,
  fadeOut,
  next: null,
})

const approach = (v: number, target: number, up: number, down: number, dt: number): number =>
  v < target ? Math.min(target, v + up * dt) : Math.max(target, v - down * dt)

/** Время рампы параметров на каждом обновлении (≥ периода обновления → кусочно-линейная непрерывная кривая). */
const PARAM_RAMP = 0.25
/** На сколько вперёд планируются ритмические события, с (от ctx.now()). */
const HORIZON = 0.4

type VehicleKind = 'bus' | 'taxi'
const VEHICLE: Record<VehicleKind, { f0: number; f1: number; osc: number; lp0: number; lp1: number; rumble0: number; rumble1: number; road: number; level: number }> = {
  bus: { f0: 31, f1: 52, osc: 0.5, lp0: 220, lp1: 340, rumble0: 0.45, rumble1: 0.75, road: 0.3, level: 0.36 },
  taxi: { f0: 38, f1: 66, osc: 0.16, lp0: 150, lp1: 210, rumble0: 0.32, rumble1: 0.55, road: 0.45, level: 0.32 },
}

const STEP: Record<StepSurface, { low: number; lowVel: number; high: number; highVel: number; hold: number }> = {
  asphalt: { low: 520, lowVel: 0.5, high: 2600, highVel: 0.22, hold: 0.01 },
  floor: { low: 700, lowVel: 0.32, high: 3300, highVel: 0.38, hold: 0.006 },
  grass: { low: 340, lowVel: 0.25, high: 1400, highVel: 0.28, hold: 0.06 },
  snow: { low: 300, lowVel: 0.3, high: 0, highVel: 0, hold: 0.02 },
}

/** Фазы, где персонаж идёт пешком внутри помещения (метро): шаги по полу. */
const INDOOR_WALK = new Set<TravelPhase>([
  'metro-vestibule',
  'metro-turnstile',
  'metro-boarding',
  'metro-alighting',
  'metro-transfer',
  'metro-exit',
  'building-enter',
  'building-exit',
  'walk-arrive',
  'walk-exit-place',
  'walk-street',
])

/**
 * Звуки путешествия (Character Travel State Machine, §5.4): поезд (нарастание и спад
 * тоннельного гула, стук колёс, скрип тормозов), двери-«динь», турникет и валидатор,
 * автобус (двигатель, пневматика дверей и тормозов, поворотник), такси (салонный гул,
 * двери, поворотник), шаги по разным поверхностям, звуковой светофор, эскалатор.
 *
 * Жизненный цикл: все узлы создаются в init() и живут до dispose(); во время работы новые
 * Tone-узлы не создаются. Непрерывные слои — GatedLayer (отключаются от шины в нуле), удары —
 * NoiseBurst с подключением «по требованию», синты — за OutputGate. Параметры меняются только
 * рампами; модель движения (скорость/присутствие) интегрируется в update() (~5 Гц).
 * Шина — городская (cityIn): от музыки не зависит.
 */
export class TravelSoundEngine {
  private nodes: Array<{ dispose: () => unknown } | null> = []
  private disposed = false
  private ctx: ToneNS.BaseContext
  private bank: NoiseBank

  private out!: ToneNS.Gain
  // поезд
  private trainBed!: GatedLayer
  private trainLp!: ToneNS.Filter
  private trainBp!: ToneNS.Filter
  private whoosh!: ToneNS.Gain
  private squealBed!: GatedLayer
  private squealBp!: ToneNS.Filter
  private squealBp2!: ToneNS.Filter
  private clack!: NoiseBurst
  // автобус / такси
  private vehicleBed!: GatedLayer
  private engOsc!: ToneNS.Oscillator
  private engLp!: ToneNS.Filter
  private engOscG!: ToneNS.Gain
  private rumbleG!: ToneNS.Gain
  private roadG!: ToneNS.Gain
  // эскалатор
  private escBed!: GatedLayer
  // удары
  private tick!: NoiseBurst
  private hiss!: NoiseBurst
  private thump!: NoiseBurst
  private click!: NoiseBurst
  private stepLow!: NoiseBurst
  private stepHigh!: NoiseBurst
  // тональные сигналы
  private bellA!: ToneNS.Synth
  private bellB!: ToneNS.Synth
  private beep!: ToneNS.Synth
  private tonalGate!: OutputGate
  private bellFlip = false

  // модель
  private train = mover(0.18, 0.26, 0.7, 0.3)
  private vehicle = mover(0.22, 0.35, 0.8, 0.4)
  private vehicleKind: VehicleKind = 'bus'
  private escalator = false
  private walkIndoor = false
  private wander = false
  private phase: TravelPhase | null = null
  private lastUpdate = -1
  private lastPresence = -1
  private crossing: { fastAt: number; end: number } | null = null
  private turnUntil = 0
  private nextClack = 0
  private nextEsc = 0
  private nextTick = 0
  private tickOn = true
  private nextStep = 0
  private stepFoot = 0
  private nextWander = 0
  private lastValue = new WeakMap<object, number>()
  /** счётчики для диагностики/тестов */
  readonly counters = { phases: 0, cues: 0, steps: 0 }

  constructor(
    private T: ToneModule,
    private mixer: AudioMixer,
    private opts: TravelSoundOptions = {},
  ) {
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
    this.out = track(new T.Gain(0.8))
    this.out.connect(this.mixer.cityIn)
    const bed = (g: ToneNS.Gain) => new GatedLayer(this.ctx, g, this.out)

    // поезд: низкий тоннельный гул (коричневый шум, LP растёт со скоростью) + «свист воздуха»
    const trainMix = track(new T.Gain(0))
    this.trainLp = track(new T.Filter({ type: 'lowpass', frequency: 120, Q: 0.7 }))
    b.get('brown').chain(this.trainLp, trainMix)
    this.trainBp = track(new T.Filter({ type: 'bandpass', frequency: 500, Q: 0.6 }))
    this.whoosh = track(new T.Gain(0))
    b.get('pink').chain(this.trainBp, this.whoosh, trainMix)
    this.trainBed = bed(trainMix)
    // скрип тормозов: две узкие полосы белого шума (металлический «свист»), частота падает со скоростью
    const squealMix = track(new T.Gain(0))
    this.squealBp = track(new T.Filter({ type: 'bandpass', frequency: 2600, Q: 16 }))
    this.squealBp2 = track(new T.Filter({ type: 'bandpass', frequency: 3500, Q: 20 }))
    const sq2 = track(new T.Gain(0.5))
    b.get('white').chain(this.squealBp, squealMix)
    b.get('white').chain(this.squealBp2, sq2, squealMix)
    this.squealBed = bed(squealMix)
    this.clack = track(new NoiseBurst(T, { noise: 'brown', filter: 'bandpass', freq: 280, q: 1.2, attack: 0.008, release: 0.1, gain: 1.1, voices: 3 }, b))
    this.clack.connectGated(this.out)

    // автобус / такси: треугольник «оборотов» под LP + низкий рокот + шум шин
    const vehMix = track(new T.Gain(0))
    this.engOsc = track(new T.Oscillator({ frequency: 31, type: 'triangle' }))
    this.engLp = track(new T.Filter({ type: 'lowpass', frequency: 220, Q: 0.5 }))
    this.engOscG = track(new T.Gain(0.5))
    this.engOsc.chain(this.engLp, this.engOscG, vehMix)
    this.engOsc.start()
    const rumbleLp = track(new T.Filter({ type: 'lowpass', frequency: 180 }))
    this.rumbleG = track(new T.Gain(0.45))
    b.get('brown').chain(rumbleLp, this.rumbleG, vehMix)
    const roadBp = track(new T.Filter({ type: 'bandpass', frequency: 420, Q: 0.5 }))
    this.roadG = track(new T.Gain(0))
    b.get('pink').chain(roadBp, this.roadG, vehMix)
    this.vehicleBed = bed(vehMix)

    // эскалатор: низкий механический гул
    const escMix = track(new T.Gain(0))
    const escBp = track(new T.Filter({ type: 'bandpass', frequency: 105, Q: 1.4 }))
    b.get('brown').chain(escBp, escMix)
    this.escBed = bed(escMix)

    // удары (подключаются к шине только на время звучания)
    const burst = (o: ConstructorParameters<typeof NoiseBurst>[1]) => {
      const n = track(new NoiseBurst(T, o, b))
      n.connectGated(this.out)
      return n
    }
    this.tick = burst({ noise: 'white', filter: 'bandpass', freq: 1500, q: 5, attack: 0.003, release: 0.018, gain: 0.5, voices: 2 })
    this.hiss = burst({ noise: 'white', filter: 'bandpass', freq: 3800, q: 0.5, attack: 0.03, release: 0.45, gain: 0.22, voices: 2 })
    this.thump = burst({ noise: 'brown', filter: 'lowpass', freq: 170, q: 0.7, attack: 0.004, release: 0.2, gain: 0.8, voices: 3 })
    this.click = burst({ noise: 'white', filter: 'bandpass', freq: 3000, q: 1.5, attack: 0.003, release: 0.02, gain: 0.35, voices: 3 })
    this.stepLow = burst({ noise: 'pink', filter: 'lowpass', freq: 520, q: 0.7, attack: 0.004, release: 0.07, gain: 0.55, voices: 3 })
    this.stepHigh = burst({ noise: 'white', filter: 'bandpass', freq: 2600, q: 1, attack: 0.003, release: 0.03, gain: 0.16, voices: 3 })

    // «динь-дон» и пиканье: моно-синты (без пула голосов), общий выход за гейтом
    const tonal = track(new T.Gain(1))
    this.tonalGate = new OutputGate(this.ctx, tonal, this.out)
    const bell = () =>
      track(
        new T.Synth({
          oscillator: { type: 'sine' },
          envelope: { attack: 0.006, decay: 1.3, sustain: 0, release: 0.3 },
          volume: -25,
        } as never),
      )
    this.bellA = bell()
    this.bellB = bell()
    this.beep = track(
      new T.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.004, decay: 0.06, sustain: 0.6, release: 0.03 },
        volume: -27,
      } as never),
    )
    for (const s of [this.bellA, this.bellB, this.beep]) s.connect(tonal)
  }

  // ───────── входы ─────────

  /** Новая фаза путешествия (смена worldStore.event). */
  onPhase(e: TravelSoundInput): void {
    if (this.disposed) return
    this.counters.phases++
    const phase = e.phase ?? 'activity'
    this.phase = phase
    const now = this.ctx.now()
    const d = Math.max(0.3, Number.isFinite(e.duration) ? e.duration : 1)
    const tr = this.train
    const ve = this.vehicle
    tr.next = null
    ve.next = null
    tr.fadeIn = 0.7
    this.escalator = phase === 'metro-escalator-down' || phase === 'metro-escalator-up'
    this.walkIndoor = e.indoor && INDOOR_WALK.has(phase)
    this.wander = false
    if (!phase.startsWith('walk-') && phase !== 'building-exit' && phase !== 'building-enter') this.crossing = null

    const trainOut = () => {
      if (tr.presence > 0.02) {
        tr.targetSpeed = 0.7
        tr.targetPresence = 0
      } else {
        tr.targetSpeed = 0
        tr.targetPresence = 0
      }
    }
    const vehicleOut = () => {
      ve.targetPresence = 0
      ve.targetSpeed = ve.presence > 0.02 ? 0.6 : 0
    }
    const vehicleIn = (kind: VehicleKind, presence: number, arriving: boolean) => {
      if (ve.presence < 0.03) {
        this.vehicleKind = kind
        if (arriving) ve.speed = 0.5
      }
      ve.targetPresence = presence
      ve.targetSpeed = 0
    }

    switch (phase) {
      case 'metro-train-arrival':
        // поезд выходит из тоннеля: гул нарастает ~2.5 с, одновременно торможение
        if (tr.presence < 0.03) tr.speed = 0.7
        tr.fadeIn = 0.4
        tr.targetPresence = 1
        tr.targetSpeed = 0
        vehicleOut()
        break
      case 'metro-boarding':
        tr.targetPresence = 1
        tr.targetSpeed = 0
        break
      case 'metro-departure':
      case 'metro-ride':
        tr.targetPresence = 1
        tr.targetSpeed = 1
        vehicleOut()
        break
      case 'metro-arriving':
        tr.targetPresence = 1
        tr.targetSpeed = 0
        break
      case 'metro-alighting':
        // поезд стоит, мы вышли; через пару секунд он уходит в тоннель
        tr.targetSpeed = 0
        tr.next = { at: now + Math.min(2.5, 0.8 + d), speed: 0.7, presence: 0 }
        break
      case 'bus-arrival':
        trainOut()
        vehicleIn('bus', 1, true)
        break
      case 'bus-boarding':
      case 'bus-validate':
        vehicleIn('bus', 1, false)
        break
      case 'bus-ride':
        vehicleIn('bus', 1, false)
        ve.targetSpeed = 0.85
        this.wander = true
        if (Math.random() < 0.25) this.turnSignal(now + 0.5, 4 + Math.random() * 3)
        break
      case 'bus-traffic-light':
        vehicleIn('bus', 1, false)
        if (Math.random() < 0.5) this.turnSignal(now + 0.2, 3 + Math.random() * 2)
        break
      case 'bus-alighting':
        vehicleIn('bus', 1, false)
        ve.next = { at: now + Math.min(2.5, 1 + d), speed: 0.6, presence: 0 }
        break
      case 'taxi-arrival':
        trainOut()
        vehicleIn('taxi', 0.55, true)
        break
      case 'taxi-boarding':
        vehicleIn('taxi', 1, false)
        break
      case 'taxi-ride':
        vehicleIn('taxi', 1, false)
        ve.targetSpeed = 0.8
        this.wander = true
        if (Math.random() < 0.4) this.turnSignal(now + 1, 3 + Math.random() * 3)
        break
      case 'taxi-alighting':
        vehicleIn('taxi', 1, false)
        ve.next = { at: now + Math.min(2.5, 1 + d), speed: 0.5, presence: 0 }
        break
      case 'walk-crossing':
        trainOut()
        vehicleOut()
        // «тук… тук» пока красный, частые щелчки на зелёный и ещё немного на переходе
        this.crossing = { fastAt: now + Math.max(1, d * 0.65), end: now + Math.max(1.6, d) + 1.6 }
        this.nextTick = now + 0.05
        break
      default:
        trainOut()
        vehicleOut()
    }
    for (const cue of e.sounds ?? []) this.cue(cue, now)
  }

  /** Шаг героя на улице (eventBus 'footstep'). Снег дополнительно скрипит в WeatherSoundEngine. */
  onFootstep(surface: StepSurface): void {
    if (this.disposed) return
    this.step(surface, this.ctx.now() + 0.01, 1)
  }

  // ───────── звуковые подсказки ─────────

  private cue(c: TravelSoundCue, t: number): void {
    this.counters.cues++
    switch (c) {
      case 'turnstile':
        this.beepAt(t + 0.05, 1320, 0.09, 0.8)
        this.thump.hit(t + 0.4, 0.55, 0.02, 220)
        this.click.hit(t + 0.42, 0.5, 0.004, 2400)
        break
      case 'validator-beep':
        this.beepAt(t + 0.05, 1760, 0.12, 0.75)
        break
      case 'doors-open':
        this.hiss.hit(t + 0.5, 0.7, 0.35, 3600)
        this.thump.hit(t + 0.9, 0.35, 0.02, 160)
        break
      case 'doors-close':
        this.chime(t + 0.05, [880, 698.46])
        this.hiss.hit(t + 1.3, 0.7, 0.3, 3400)
        this.thump.hit(t + 1.75, 0.55, 0.02, 150)
        break
      case 'station-announcement':
        this.chime(t + 0.1, [659.25, 783.99, 987.77])
        break
      case 'bus-arrive':
        this.hiss.hit(t + 1.2, 0.8, 0.25, 4200)
        break
      case 'bus-brake':
        this.hiss.hit(t + 0.9, 0.7, 0.2, 4400)
        break
      case 'bus-doors':
        this.hiss.hit(t + 1.6, 0.85, 0.45, 3000)
        this.thump.hit(t + 2.15, 0.5, 0.02, 190)
        break
      case 'car-door':
        this.click.hit(t + 0.05, 0.45, 0.004, 2600)
        this.thump.hit(t + 0.75, 0.75, 0.02, 140)
        this.click.hit(t + 0.77, 0.3, 0.004, 3200)
        break
      case 'building-door':
        this.click.hit(t + 0.05, 0.5, 0.004, 2200)
        this.stepHigh.hit(t + 0.15, 0.25, 0.25, 1200)
        this.thump.hit(t + 0.85, 0.6, 0.02, 180)
        break
      case 'phone-tap':
        this.click.hit(t + 0.1, 0.18, 0.003, 3800)
        this.click.hit(t + 0.38, 0.16, 0.003, 3900)
        this.click.hit(t + 0.62, 0.17, 0.003, 3700)
        break
      case 'keyboard': {
        let k = t + 0.1
        for (let i = 0; i < 7; i++) {
          this.click.hit(k, 0.14 + Math.random() * 0.1, 0.003, 2600 + Math.random() * 1200)
          k += 0.1 + Math.random() * 0.12
        }
        break
      }
      case 'page-turn':
        this.stepHigh.hit(t + 0.1, 0.22, 0.16, 1700)
        break
      case 'cup':
        this.beepAt(t + 0.1, 2960, 0.03, 0.35)
        this.beepAt(t + 0.19, 4440, 0.02, 0.18)
        break
      // непрерывные звуки (тоннель, двигатель, прибытие, торможение) ведёт модель движения;
      // шаги — по событиям footstep; эмбиент платформы — городской слой метро
      default:
        break
    }
  }

  private chime(t: number, freqs: number[]): void {
    let at = t
    for (const f of freqs) {
      this.bellFlip = !this.bellFlip
      const s = this.bellFlip ? this.bellA : this.bellB
      const when = at
      safe(() => s.triggerAttackRelease(f, 0.9, when, 0.6))
      at += 0.42
    }
    this.tonalGate.hold(at + 1.7)
  }

  private beepAt(t: number, f: number, dur: number, vel: number): void {
    safe(() => this.beep.triggerAttackRelease(f, dur, t, vel))
    this.tonalGate.hold(t + dur + 0.1)
  }

  private turnSignal(from: number, seconds: number): void {
    if (this.turnUntil < from) this.nextTick = from
    this.turnUntil = Math.max(this.turnUntil, from + seconds)
  }

  private step(surface: StepSurface, t: number, k: number): void {
    const s = STEP[surface] ?? STEP.asphalt
    this.stepFoot = 1 - this.stepFoot
    const alt = this.stepFoot ? 1 : 0.85
    const vel = k * alt * (0.85 + Math.random() * 0.25)
    this.stepLow.hit(t, s.lowVel * vel, s.hold, s.low * (0.9 + Math.random() * 0.2))
    if (s.high > 0) this.stepHigh.hit(t + 0.012, s.highVel * vel, s.hold * 0.5, s.high * (0.85 + Math.random() * 0.3))
    this.counters.steps++
  }

  // ───────── обновление (~5 Гц, таймер аудиоконтекста) ─────────

  update(): void {
    if (this.disposed) return
    const cur = this.ctx.currentTime
    const now = this.ctx.now()
    const dt = this.lastUpdate < 0 ? 0.2 : Math.min(1, Math.max(0, cur - this.lastUpdate))
    this.lastUpdate = cur
    const horizon = now + HORIZON
    const tr = this.train
    const ve = this.vehicle

    for (const m of [tr, ve]) {
      if (m.next && now >= m.next.at) {
        m.targetSpeed = m.next.speed
        m.targetPresence = m.next.presence
        m.next = null
      }
    }
    if (this.wander && now >= this.nextWander) {
      ve.targetSpeed = 0.62 + Math.random() * 0.38
      this.nextWander = now + 3 + Math.random() * 5
    }
    const trainPrev = tr.speed
    for (const m of [tr, ve]) {
      m.speed = approach(m.speed, m.targetSpeed, m.accel, m.decel, dt)
      m.presence = approach(m.presence, m.targetPresence, m.fadeIn, m.fadeOut, dt)
    }

    // поезд
    const trainLevel = tr.presence * (0.2 + 0.8 * tr.speed) * 0.38
    this.trainBed.set(trainLevel, PARAM_RAMP)
    if (this.trainBed.active) {
      this.ramp(this.trainLp.frequency, 110 + 650 * tr.speed)
      this.ramp(this.trainBp.frequency, 450 + 900 * tr.speed)
      this.ramp(this.whoosh.gain, 0.35 * tr.speed * tr.speed)
    }
    const braking = tr.speed < trainPrev - 1e-4 && tr.targetSpeed < tr.speed
    const brake = braking && tr.speed < 0.6 ? Math.min(1, (0.6 - tr.speed) / 0.25) * Math.min(1, tr.speed / 0.06) : 0
    this.squealBed.set(tr.presence * brake * 0.22, PARAM_RAMP)
    if (this.squealBed.active) {
      this.ramp(this.squealBp.frequency, 1900 + 1500 * tr.speed)
      this.ramp(this.squealBp2.frequency, (1900 + 1500 * tr.speed) * 1.36)
    }
    if (Math.abs(tr.presence - this.lastPresence) > 0.02 || (tr.presence === 0 && this.lastPresence !== 0)) {
      this.lastPresence = tr.presence
      this.opts.onTrainPresence?.(tr.presence)
    }
    // стук колёс: «та-дах», чаще с ростом скорости
    if (tr.presence > 0.04 && tr.speed > 0.12) {
      if (this.nextClack < now) this.nextClack = now + 0.05
      const gap = 0.62 / Math.max(0.25, tr.speed)
      const vel = tr.presence * (0.3 + 0.5 * tr.speed)
      while (this.nextClack < horizon) {
        this.clack.hit(this.nextClack, vel * (0.85 + Math.random() * 0.2), 0.01)
        this.clack.hit(this.nextClack + 0.14 / Math.max(0.5, tr.speed), vel * 0.7, 0.01)
        this.nextClack += gap
      }
    }

    // автобус / такси
    const v = VEHICLE[this.vehicleKind]
    // на холостых тише, чем на ходу
    this.vehicleBed.set(ve.presence * v.level * (0.6 + 0.4 * ve.speed), PARAM_RAMP)
    if (this.vehicleBed.active) {
      this.ramp(this.engOsc.frequency, v.f0 + (v.f1 - v.f0) * ve.speed)
      this.ramp(this.engLp.frequency, v.lp0 + (v.lp1 - v.lp0) * ve.speed)
      this.ramp(this.engOscG.gain, v.osc)
      this.ramp(this.rumbleG.gain, v.rumble0 + (v.rumble1 - v.rumble0) * ve.speed)
      this.ramp(this.roadG.gain, v.road * ve.speed)
    }
    if (this.wander && ve.presence > 0.6 && this.turnUntil < now && Math.random() < (this.vehicleKind === 'taxi' ? 0.012 : 0.006)) {
      this.turnSignal(now + 0.1, 3 + Math.random() * 4)
    }

    // эскалатор
    this.escBed.set(this.escalator ? 0.2 : 0, this.escalator ? 0.8 : 1.2)
    if (this.escalator) {
      if (this.nextEsc < now) this.nextEsc = now + 0.3
      while (this.nextEsc < horizon) {
        this.thump.hit(this.nextEsc, 0.12 + Math.random() * 0.05, 0.01, 240)
        this.nextEsc += 1.15
      }
    }

    // поворотник (реле: «тик» на включении, «так» на выключении) и звуковой светофор
    const cross = this.crossing
    if (cross && now > cross.end) this.crossing = null
    if (this.turnUntil > now || this.crossing) {
      if (this.nextTick < now) this.nextTick = now + 0.05
      while (this.nextTick < horizon) {
        const t = this.nextTick
        if (this.crossing) {
          const fast = t >= this.crossing.fastAt
          this.tick.hit(t, fast ? 0.42 : 0.5, 0.004, fast ? 1250 : 1050)
          this.nextTick += fast ? 0.26 : 1.0
          if (t > this.crossing.end) break
        } else if (t < this.turnUntil) {
          this.tick.hit(t, this.tickOn ? 0.45 : 0.3, 0.003, this.tickOn ? 2500 : 1750)
          this.tickOn = !this.tickOn
          this.nextTick += 0.37
        } else break
      }
    }

    // шаги по полу в метро/помещениях (на улице шаги приходят событиями footstep)
    if (this.walkIndoor) {
      if (this.nextStep < now) this.nextStep = now + 0.1
      while (this.nextStep < horizon) {
        this.step('floor', this.nextStep, 0.9)
        this.nextStep += 0.55 + Math.random() * 0.04
      }
    }
  }

  /** Рампа параметра от текущего значения (без скачков). Не трогаем, если цель не изменилась. */
  private ramp(p: ToneNS.Param<'frequency'> | ToneNS.Param<'gain'> | ToneNS.Signal<'frequency'>, v: number): void {
    if (!Number.isFinite(v)) return
    const last = this.lastValue.get(p)
    if (last !== undefined && Math.abs(last - v) < Math.max(1e-4, Math.abs(v) * 0.002)) return
    this.lastValue.set(p, v)
    safe(() => (p as ToneNS.Param<'gain'>).linearRampTo(v, PARAM_RAMP))
  }

  // ───────── диагностика ─────────

  /** Tone-узлов, созданных движком (фиксировано после init). */
  nodeCount(): number {
    return this.nodes.length + this.bank.size
  }

  /** Сколько слоёв/ударов сейчас подключено к шине (0 в тишине). */
  activeOutputs(): number {
    const beds = [this.trainBed, this.squealBed, this.vehicleBed, this.escBed].filter((g) => g?.active).length
    const bursts = [this.clack, this.tick, this.hiss, this.thump, this.click, this.stepLow, this.stepHigh].filter((n) => n?.connected).length
    return beds + bursts + (this.tonalGate?.active ? 1 : 0)
  }

  /** Снимок модели (диагностика/тесты). */
  state() {
    return {
      phase: this.phase,
      train: { speed: this.train.speed, presence: this.train.presence },
      vehicle: { kind: this.vehicleKind, speed: this.vehicle.speed, presence: this.vehicle.presence },
      escalator: this.escalator,
      walkIndoor: this.walkIndoor,
      crossing: !!this.crossing,
      turnSignal: this.turnUntil > this.ctx.now(),
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const g of [this.trainBed, this.squealBed, this.vehicleBed, this.escBed]) g?.dispose()
    this.tonalGate?.dispose()
    disposeAll(this.nodes)
    this.nodes = []
    this.bank.dispose()
  }
}
