import { type Rng, chance, clamp, mod, pick, randInt } from './rng'
import { NOTE_NAMES, type Progression, generateProgression } from './ChordGenerator'
import { type Motif, type MelodyNote, generateMelody, generateMotif } from './MelodyGenerator'
import { type DrumBar, drumBarsFor, generateDrumPattern } from './DrumGenerator'

export type DayPart = 'dawn' | 'day' | 'dusk' | 'night'

export interface MoodContext {
  /** минуты суток 0..1440 */
  minutes: number
  /** 0..1 */
  rain: number
  snow?: number
}

export interface PhrasePlan {
  index: number
  bars: 4 | 8
  bpm: number
  /** 0.5 = без свинга, ~0.55-0.6 = лёгкий свинг */
  swing: number
  keyPc: number
  keyName: string
  progression: Progression
  melody: MelodyNote[]
  drums: DrumBar[]
  melodyOn: boolean
  drumsOn: boolean
  /** 0..1 общий уровень энергии */
  intensity: number
  /** частота среза общего lowpass, Гц */
  cutoff: number
  dayPart: DayPart
  mood: string
  title: string
  /** началась ли новая «секция» (смена мелодии/ритма) */
  variation: boolean
}

export function dayPartOf(minutes: number): DayPart {
  const m = mod(minutes, 1440)
  if (m >= 300 && m < 480) return 'dawn'
  if (m >= 480 && m < 1080) return 'day'
  if (m >= 1080 && m < 1320) return 'dusk'
  return 'night'
}

const BPM_RANGE: Record<DayPart, [number, number]> = {
  night: [65, 74],
  dawn: [66, 78],
  dusk: [68, 80],
  day: [72, 90],
}

const PLACES = ['Patriki', 'Arbat', 'Chistye Prudy', 'Tverskaya', 'Zamoskvorechye', 'Khamovniki', 'Kitay-gorod', 'Neskuchny', 'Gorky Park', 'Zaryadye']
const TITLES: Record<string, string[]> = {
  rain: ['Rain on {p}', 'Puddles near {p}', 'Umbrella Blues, {p}', 'Grey Skies over {p}'],
  snow: ['Snow on {p}', 'Frost at {p}', 'Quiet Snowfall, {p}'],
  night: ['Midnight at {p}', 'Last Metro to {p}', 'Sleepless in {p}', 'Streetlights on {p}'],
  dawn: ['Early Light, {p}', 'Sunrise over {p}', 'First Coffee at {p}'],
  dusk: ['Golden Hour, {p}', 'Evening Walk, {p}', 'Dusk at {p}'],
  day: ['Afternoon at {p}', 'Sunny Bench, {p}', 'Slow Day in {p}', 'Wandering {p}'],
}

export class Arranger {
  private phrase = 0
  private keyPc: number
  private bpm = 0
  private prevTemplate: string | null = null
  private motif: Motif
  private drumBase: DrumBar
  private untilVariation: number
  private lastKeyChange = 0

  constructor(private rng: Rng) {
    this.keyPc = randInt(rng, 0, 11)
    this.motif = generateMotif(rng)
    this.drumBase = generateDrumPattern(rng, 0.5)
    this.untilVariation = randInt(rng, 3, 4)
  }

  next(ctx: MoodContext): PhrasePlan {
    const rng = this.rng
    const part = dayPartOf(ctx.minutes)
    const rain = clamp(ctx.rain, 0, 1)
    const snow = clamp(ctx.snow ?? 0, 0, 1)
    const soft = part === 'night' ? 1 : part === 'dawn' || part === 'dusk' ? 0.5 : 0
    const gloom = Math.max(rain, snow * 0.6)

    let variation = this.phrase === 0
    if (this.phrase > 0 && --this.untilVariation <= 0) {
      variation = true
      this.untilVariation = randInt(rng, 3, 5)
    }
    if (variation) {
      this.motif = generateMotif(rng)
      if (chance(rng, 0.6)) this.drumBase = generateDrumPattern(rng, 0.6 - soft * 0.3)
      // иногда плавная смена тональности: на кварту/квинту/малую терцию
      if (this.phrase > 0 && this.phrase - this.lastKeyChange >= 3 && chance(rng, 0.35)) {
        this.keyPc = mod(this.keyPc + pick(rng, [5, 7, 3, 9, 2]), 12)
        this.lastKeyChange = this.phrase
      }
    }

    // темп: плавный дрейф внутри диапазона по времени суток, дождь — медленнее
    let [lo, hi] = BPM_RANGE[part]
    if (gloom > 0.3) {
      lo = Math.max(65, lo - 3)
      hi = Math.max(lo + 3, hi - 6 * gloom)
    }
    if (this.bpm === 0) this.bpm = randInt(rng, lo, hi)
    else this.bpm = clamp(this.bpm + (variation ? randInt(rng, -5, 5) : randInt(rng, -1, 1)), lo, hi)
    const bpm = Math.round(this.bpm)

    const bars: 4 | 8 = this.phrase === 0 ? 4 : chance(rng, 0.45) ? 8 : 4
    const progression = generateProgression(rng, this.keyPc, bars, this.prevTemplate)
    this.prevTemplate = progression.templateId

    const melodyDensity = clamp(0.85 - soft * 0.3 - gloom * 0.15, 0.35, 0.9)
    const melodyOn = this.phrase === 0 ? false : !chance(rng, 0.12 + soft * 0.1)
    const drumsOn = this.phrase === 0 ? true : !chance(rng, 0.08)
    const melody = generateMelody(rng, progression, this.keyPc, this.motif, melodyDensity)
    const drums = drumBarsFor(rng, this.drumBase, bars)

    const intensity = clamp(0.7 - soft * 0.3 - gloom * 0.2 + (rng() - 0.5) * 0.1, 0.2, 0.9)
    const cutoff = clamp(4200 - soft * 1800 - gloom * 1600, 1400, 4500)
    const swing = clamp(0.58 - soft * 0.02 + (rng() - 0.5) * 0.03, 0.55, 0.6)

    const keyName = NOTE_NAMES[this.keyPc]
    const tplKey = rain > 0.25 ? 'rain' : snow > 0.25 ? 'snow' : part
    const title = pick(rng, TITLES[tplKey]).replace('{p}', pick(rng, PLACES)) + ` — ${progression.chords[0].symbol} · ${bpm} BPM`
    const mood =
      rain > 0.25 ? 'rainy' : snow > 0.25 ? 'snowy' : part === 'night' ? 'nocturnal' : part === 'dawn' ? 'sleepy' : part === 'dusk' ? 'mellow' : 'sunny'

    return {
      index: this.phrase++,
      bars,
      bpm,
      swing,
      keyPc: this.keyPc,
      keyName,
      progression,
      melody,
      drums,
      melodyOn,
      drumsOn,
      intensity,
      cutoff,
      dayPart: part,
      mood,
      title,
      variation,
    }
  }
}
