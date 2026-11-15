import type * as ToneNS from 'tone'
import { Arranger, type PhrasePlan } from '../generators/ArrangementGenerator'
import type { Chord } from '../generators/ChordGenerator'
import type { MelodyNote } from '../generators/MelodyGenerator'
import { mulberry32 } from '../generators/rng'
import type { MusicTrackInfo } from '../../types'
import type { AudioMixer } from './AudioMixer'
import { NoiseBank, NoiseBurst, type ToneModule, disposeAll, safe } from './audioUtils'
import { NativePoly } from './nativeVoices'

export interface MusicWorld {
  minutes: number
  rain: number
  snow: number
}

export interface MusicCallbacks {
  onTrack?: (t: MusicTrackInfo) => void
  onPhrase?: () => void
}

export const MUSIC_LAYERS = ['rhodes', 'lead', 'pad', 'bass', 'drums', 'vinyl'] as const
export type MusicLayer = (typeof MUSIC_LAYERS)[number]

export interface MusicStats {
  /** вызовов планировщика (16-е доли) */
  ticks: number
  /** шагов, пришедших позже своего времени (главный поток был занят дольше lookAhead) — их ноты пропущены */
  lateSteps: number
  /** нот, не сыгранных из-за предела полифонии */
  droppedNotes: number
  /** активных голосов сейчас */
  activeVoices: number
  /** узлов, созданных движком */
  nodes: number
  /** шумовых ударов, пропущенных из-за занятости пула */
  skippedHits: number
}

/** Полифонический инструмент (NativePoly; интерфейс совместим с PolySynth). */
interface Voices {
  readonly activeVoices: number
  maxPolyphony: number
  triggerAttackRelease: (f: number | number[], dur: number, time: number, vel?: number) => unknown
}

// Параметры голосов (те же, что были у PolySynth).
const RHODES = {
  harmonicity: 3,
  modulationIndex: 1.1,
  envelope: { attack: 0.012, decay: 1.4, sustain: 0.18, release: 0.9 },
  modulationEnvelope: { attack: 0.008, decay: 0.5, sustain: 0.1, release: 0.6 },
  volume: -15,
}
const LEAD = {
  harmonicity: 2,
  envelope: { attack: 0.02, decay: 0.7, sustain: 0.12, release: 1.0 },
  modulationEnvelope: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 0.6 },
  volume: -18,
}
const PAD = { envelope: { attack: 1.4, decay: 1, sustain: 0.8, release: 1.4 }, volume: -27 }

const REVERB_DECAY = 2.4
const REVERB_PREDELAY = 0.02

/**
 * IR как у Tone.Reverb: стерео белый шум, 0 до preDelay, затем 1 и экспоненциальное
 * приближение к 0 с τ = ln(decay+1)/ln(200). Обрезан там, где огибающая падает ниже −60 дБ.
 */
export function reverbImpulse(sampleRate: number, seed: number, decay = REVERB_DECAY, preDelay = REVERB_PREDELAY): Float32Array[] {
  const tauSec = Math.log(decay + 1) / Math.log(200)
  const len = Math.ceil((preDelay + Math.min(decay * 0.9, tauSec * Math.log(1000))) * sampleRate)
  const rnd = mulberry32(seed ^ 0x5eed)
  const start = Math.round(preDelay * sampleRate)
  return [0, 1].map(() => {
    const ch = new Float32Array(len)
    for (let i = start; i < len; i++) ch[i] = (rnd() * 2 - 1) * Math.exp(-(i - start) / sampleRate / tauSec)
    return ch
  })
}

const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)
/** допуск опоздания колбэка: позже — шаг пропускается (лучше пропустить, чем сыграть кучей) */
const LATE_TOLERANCE = 0.02

/**
 * Бесконечная процедурная lofi-музыка.
 *
 * Планирование: Transport.scheduleRepeat('16n') своего контекста → колбэк получает точное
 * аудиовремя шага заранее (lookAhead), ноты ставятся на это время. Никаких setTimeout и
 * никакого «подтягивания» опоздавших событий к now: опоздавший шаг пропускается и считается.
 * Фраза генерируется на фразу вперёд, BPM меняется на границе фразы ровно в её время.
 */
export class MusicEngine {
  private arranger: Arranger
  private rand: () => number
  private current: PhrasePlan | null = null
  private upcoming: PhrasePlan | null = null
  private step = 0
  private eventId: number | null = null
  private playing = true
  private disposed = false
  private nodes: Array<{ dispose: () => unknown } | null> = []
  private ctx: ToneNS.BaseContext
  private bank: NoiseBank
  private counters = { ticks: 0, lateSteps: 0, droppedNotes: 0 }
  private seed: number

  private rhodes!: Voices
  private lead!: Voices
  private pad!: Voices
  private bass!: ToneNS.MonoSynth
  private kick!: ToneNS.MembraneSynth
  private snareBody!: ToneNS.MembraneSynth
  private snare!: NoiseBurst
  private hat!: NoiseBurst
  private openHat!: NoiseBurst
  private click!: NoiseBurst
  private filter!: ToneNS.Filter
  private gate!: ToneNS.Gain
  private layerGain = {} as Record<MusicLayer, ToneNS.Gain>
  private solo: MusicLayer[] | null = null
  private melodyAt = new Map<number, MelodyNote[]>()
  private chordAt = new Map<number, Chord>()

  constructor(
    private T: ToneModule,
    private mixer: AudioMixer,
    private getWorld: () => MusicWorld,
    private cb: MusicCallbacks = {},
    seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0,
  ) {
    this.seed = seed
    this.arranger = new Arranger(mulberry32(seed))
    this.rand = mulberry32(seed ^ 0x9e3779b9)
    this.ctx = mixer.context
    this.bank = new NoiseBank(T)
  }

  private get transport(): ReturnType<typeof ToneNS.getTransport> {
    return this.ctx.transport as ReturnType<typeof ToneNS.getTransport>
  }

  async init(): Promise<void> {
    const T = this.T
    const track = <N extends { dispose: () => unknown }>(n: N): N => {
      this.nodes.push(n)
      return n
    }

    this.gate = track(new T.Gain(0))
    this.gate.connect(this.mixer.musicIn)
    for (const l of MUSIC_LAYERS) this.layerGain[l] = track(new T.Gain(1))

    // (гармония → chorus) + (бас/ударные напрямую) → bus → lowpass → (dry + reverb) → gate
    const bus = track(new T.Gain(1))
    const chorus = track(new T.Chorus({ frequency: 0.5, delayTime: 3.5, depth: 0.3, wet: 0.3 })).start()
    chorus.connect(bus)
    this.filter = track(new T.Filter({ type: 'lowpass', frequency: 3200, Q: 0.3 }))
    const reverbOut = track(new T.Gain(0.28))
    bus.connect(this.filter)
    this.filter.connect(this.gate)
    // Тот же IR, что строил Tone.Reverb(decay 2.4, preDelay 0.02), но обрезанный на −60 дБ
    // (1.62 с вместо 2.42 с): хвост огибающей Tone после ~1.6 с ниже −60 дБ и не слышен, а
    // стоимость свёртки пропорциональна длине IR. Без обёртки Effect (CrossFade при wet=1).
    const conv = track(new T.Convolver({ normalize: true }))
    conv.buffer = T.ToneAudioBuffer.fromArray(reverbImpulse(this.ctx.sampleRate, this.seed))
    this.filter.connect(conv)
    conv.connect(reverbOut)
    reverbOut.connect(this.gate)

    // Rhodes (FM). Атака ≥ 8 мс и плавный релиз — без щелчка начала/конца ноты.
    const trem = track(new T.Tremolo({ frequency: 4.2, depth: 0.22, spread: 40 })).start()
    this.layerGain.rhodes.chain(trem, chorus)
    // мягкое пианино для мелодии (AM) + задержка
    const delay = track(new T.FeedbackDelay({ delayTime: '8n.', feedback: 0.3, wet: 0.22 }))
    this.layerGain.lead.chain(delay, chorus)
    // эмбиент-пэд: короче релиз — меньше перекрытие аккордов → нет переполнения голосов
    const padFilter = track(new T.Filter({ type: 'lowpass', frequency: 1100, Q: 0.3 }))
    this.layerGain.pad.chain(padFilter, bus)

    // Схемы и огибающие Tone FMSynth/AMSynth/Synth на нативных узлах (см. nativeVoices.ts):
    // нота = 2–5 узлов вместо ~20 у голоса Tone, без постоянно работающих ConstantSource.
    // A/B с PolySynth (15.11): корреляция 0.998–0.9995 при сдвиге 64 отсчёта (у Tone нота
    // начинается на 1.3 мс позже запрошенного времени), RMS совпадает до 0.001 дБ.
    this.rhodes = track(new NativePoly(this.ctx, this.layerGain.rhodes, { kind: 'fm', carrier: 'sine', modulator: 'sine', ...RHODES }, 14))
    this.lead = track(new NativePoly(this.ctx, this.layerGain.lead, { kind: 'am', carrier: 'triangle', modulator: 'sine', ...LEAD }, 6))
    this.pad = track(new NativePoly(this.ctx, this.layerGain.pad, { kind: 'plain', oscillator: 'triangle', ...PAD }, 14))

    // тёплый бас (портаменто 15 мс — переход между нотами без излома)
    const bassFilter = track(new T.Filter({ type: 'lowpass', frequency: 420, Q: 0.5 }))
    this.bass = track(
      new T.MonoSynth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.03, decay: 0.3, sustain: 0.55, release: 0.4 },
        filterEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.3, baseFrequency: 110, octaves: 2 },
        portamento: 0.015,
        volume: -11,
      }),
    )
    this.bass.chain(this.layerGain.bass, bassFilter, bus)

    // ударные (синтез); один общий шумовой источник на все шумовые удары
    const drumBus = track(new T.Filter({ type: 'lowpass', frequency: 5200 }))
    this.layerGain.drums.connect(drumBus)
    drumBus.connect(bus)
    this.kick = track(new T.MembraneSynth({ pitchDecay: 0.05, octaves: 3, envelope: { attack: 0.006, decay: 0.34, sustain: 0, release: 0.12 }, volume: -11 }))
    this.kick.connect(this.layerGain.drums)
    this.snareBody = track(new T.MembraneSynth({ pitchDecay: 0.02, octaves: 2, envelope: { attack: 0.004, decay: 0.12, sustain: 0, release: 0.06 }, volume: -20 }))
    this.snareBody.connect(this.layerGain.drums)
    const b = this.bank
    this.snare = track(new NoiseBurst(T, { noise: 'pink', filter: 'bandpass', freq: 1800, q: 0.7, attack: 0.004, release: 0.17, gain: 0.35, voices: 2 }, b))
    this.snare.connect(this.layerGain.drums)
    this.hat = track(new NoiseBurst(T, { noise: 'white', filter: 'highpass', freq: 5000, attack: 0.004, release: 0.05, gain: 0.12, voices: 2 }, b))
    this.hat.connect(this.layerGain.drums)
    this.openHat = track(new NoiseBurst(T, { noise: 'white', filter: 'highpass', freq: 5000, attack: 0.006, release: 0.25, gain: 0.09, voices: 2 }, b))
    this.openHat.connect(this.layerGain.drums)

    // винил: тихий шорох + редкие мягкие потрескивания (мимо фильтра музыки)
    const vinylHp = track(new T.Filter({ type: 'highpass', frequency: 1200 }))
    const vinylLp = track(new T.Filter({ type: 'lowpass', frequency: 5000 }))
    const vinylGain = track(new T.Gain(0.012))
    b.get('pink').chain(vinylHp, vinylLp, vinylGain, this.layerGain.vinyl)
    this.click = track(new NoiseBurst(T, { noise: 'white', filter: 'bandpass', freq: 2500, q: 0.5, attack: 0.003, release: 0.02, gain: 0.07, voices: 3 }, b))
    this.click.connect(this.layerGain.vinyl)
    this.layerGain.vinyl.connect(this.gate)
  }

  /** Запуск бесконечного воспроизведения. Transport не останавливается до dispose(). */
  start(): void {
    if (this.disposed || this.eventId !== null) return
    const tp = this.transport
    this.upcoming = this.plan()
    tp.bpm.value = this.upcoming.bpm
    this.step = 0
    this.current = null
    this.eventId = tp.scheduleRepeat((time) => this.tick(time), '16n')
    if (tp.state !== 'started') tp.start(this.ctx.now() + 0.1)
    this.setPlaying(this.playing)
  }

  /** Transport запущен и шаги планируются (проверка после восстановления страницы). */
  get isScheduling(): boolean {
    return this.eventId !== null && this.transport.state === 'started'
  }

  /** Восстановить планирование, если Transport остановился (без второго экземпляра). */
  ensureScheduling(): void {
    if (this.disposed || this.eventId === null) return
    if (this.transport.state !== 'started') this.transport.start(this.ctx.now() + 0.1)
  }

  /** Плавный fade play/pause (Transport продолжает идти). */
  setPlaying(v: boolean): void {
    this.playing = v
    if (!this.gate || this.disposed) return
    this.gate.gain.rampTo(v ? 1 : 0, v ? 1.2 : 1.6)
  }

  /** Соло слоёв (диагностика). null — все слои. */
  setSolo(layers: MusicLayer[] | null): void {
    this.solo = layers && layers.length ? layers : null
    for (const l of MUSIC_LAYERS) {
      const on = !this.solo || this.solo.includes(l)
      safe(() => this.layerGain[l].gain.rampTo(on ? 1 : 0, 0.15))
    }
  }

  getSolo(): MusicLayer[] | null {
    return this.solo
  }

  stats(): MusicStats {
    const voices = (s: Voices | undefined) => (s ? s.activeVoices : 0)
    return {
      ...this.counters,
      activeVoices: voices(this.rhodes) + voices(this.lead) + voices(this.pad),
      nodes: this.nodes.length + this.bank.size,
      skippedHits: [this.snare, this.hat, this.openHat, this.click].reduce((a, n) => a + (n?.skipped ?? 0), 0),
    }
  }

  private plan(): PhrasePlan {
    const w = this.getWorld()
    return this.arranger.next({ minutes: w.minutes, rain: w.rain, snow: w.snow })
  }

  private beginPhrase(time: number): void {
    const plan = this.upcoming ?? this.plan()
    this.current = plan
    this.upcoming = null
    this.melodyAt.clear()
    this.chordAt.clear()
    for (const n of plan.melody) {
      const arr = this.melodyAt.get(n.step)
      if (arr) arr.push(n)
      else this.melodyAt.set(n.step, [n])
    }
    for (const c of plan.progression.chords) this.chordAt.set(c.startStep, c)
    const bpm = this.transport.bpm
    if (Math.abs(bpm.getValueAtTime(time) - plan.bpm) > 0.01) safe(() => bpm.setValueAtTime(plan.bpm, time))
    safe(() => this.filter.frequency.rampTo(plan.cutoff, 5, time))
    this.cb.onTrack?.({ title: plan.title, key: `${plan.keyName} major`, bpm: plan.bpm, mood: plan.mood })
    this.cb.onPhrase?.()
  }

  /** Сыграть ноту полифонического синта; при исчерпании голосов — посчитать как отброшенную. */
  private poly(s: Voices, f: number | number[], dur: number, t: number, vel: number): void {
    const n = Array.isArray(f) ? f.length : 1
    if (s.activeVoices + n > s.maxPolyphony) {
      this.counters.droppedNotes += n
      return
    }
    safe(() => s.triggerAttackRelease(f, dur, t, vel))
  }

  private tick(time: number): void {
    if (this.disposed) return
    this.counters.ticks++
    if (!this.current || this.step >= this.current.bars * 16) {
      this.step = 0
      this.beginPhrase(time)
    }
    const plan = this.current!
    const s = this.step++
    // следующая фраза заранее — за такт до конца текущей
    if (!this.upcoming && s === plan.bars * 16 - 16) this.upcoming = this.plan()

    if (!Number.isFinite(time) || time < this.ctx.currentTime - LATE_TOLERANCE) {
      this.counters.lateSteps++
      return
    }

    const beat = 60 / this.transport.bpm.getValueAtTime(time)
    const stepSec = beat / 4
    const swingDelay = s % 4 === 2 ? (plan.swing - 0.5) * beat : s % 2 === 1 ? (plan.swing - 0.5) * beat * 0.5 : 0
    const r = this.rand
    const t = time + swingDelay + r() * 0.006
    const iv = plan.intensity

    // аккорды / пэд / бас
    const chord = this.chordAt.get(s)
    if (chord) {
      const dur = chord.steps * stepSec
      const freqs = chord.notes.map(midiToFreq)
      // Rhodes затухает к sustain ~−15 дБ за ~2 с; дальше аккорд держит пэд. Длинный хвост на
      // sustain удваивал число активных FM-голосов (главная статья нагрузки аудиопотока).
      const rDur = Math.min(dur * 0.92, 2.2)
      freqs.forEach((f, i) => this.poly(this.rhodes, f, rDur, t + i * 0.011, (0.5 + iv * 0.3) * (0.85 + r() * 0.15)))
      this.poly(this.pad, freqs, dur + 0.3, t, 0.6)
      safe(() => this.bass.triggerAttackRelease(midiToFreq(chord.bass), Math.min(dur * 0.6, beat * 2.5), t, 0.8))
    } else {
      const c = this.chordFor(s)
      if (c && s - c.startStep === 10 && r() < 0.65) {
        safe(() => this.bass.triggerAttackRelease(midiToFreq(c.bass + (r() < 0.3 ? 7 : 0)), beat * 1.2, t, 0.55))
      }
    }

    // мелодия
    if (plan.melodyOn) {
      const notes = this.melodyAt.get(s)
      if (notes) for (const n of notes) this.poly(this.lead, midiToFreq(n.midi), Math.max(0.1, n.len * stepSec * 0.9), t, Math.min(1, n.vel * (0.6 + iv * 0.5)))
    }

    // ударные
    if (plan.drumsOn) {
      const bar = plan.drums[Math.floor(s / 16) % plan.drums.length]
      const p = s % 16
      const dv = 0.55 + iv * 0.45
      if (bar.kick[p] > 0) safe(() => this.kick.triggerAttackRelease('C1', 0.3, t, bar.kick[p] * dv))
      if (bar.snare[p] > 0) {
        this.snare.hit(t, bar.snare[p] * dv, 0.02)
        safe(() => this.snareBody.triggerAttackRelease(185, 0.1, t, bar.snare[p] * dv * 0.8))
      }
      if (bar.hat[p] > 0) this.hat.hit(t, bar.hat[p] * dv, 0.005)
      if (bar.openHat[p] > 0) this.openHat.hit(t, bar.openHat[p] * dv, 0.03)
    }

    // винил: редкое мягкое потрескивание, строго внутри своего шага (монотонно)
    if (r() < 0.035) this.click.hit(t + r() * stepSec * 0.8, 0.2 + r() * 0.4, 0.003, 1500 + r() * 2500)
  }

  private chordFor(step: number): Chord | null {
    const p = this.current
    if (!p) return null
    for (let i = p.progression.chords.length - 1; i >= 0; i--) if (step >= p.progression.chords[i].startStep) return p.progression.chords[i]
    return null
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.eventId !== null) safe(() => this.transport.clear(this.eventId!))
    this.eventId = null
    disposeAll(this.nodes)
    this.nodes = []
    this.bank.dispose()
  }
}
