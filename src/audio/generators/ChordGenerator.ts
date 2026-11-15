import { type Rng, mod, pick } from './rng'

export type ChordQuality = 'maj7' | 'maj9' | 'min7' | 'min9' | 'min11' | 'dom7' | 'dom9'

export const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

const INTERVALS: Record<ChordQuality, number[]> = {
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  min7: [0, 3, 7, 10],
  min9: [0, 3, 7, 10, 14],
  min11: [0, 3, 7, 10, 14, 17],
  dom7: [0, 4, 7, 10],
  dom9: [0, 4, 7, 10, 14],
}
const SUFFIX: Record<ChordQuality, string> = {
  maj7: 'maj7', maj9: 'maj9', min7: 'm7', min9: 'm9', min11: 'm11', dom7: '7', dom9: '9',
}

export interface Chord {
  symbol: string
  rootPc: number
  quality: ChordQuality
  /** MIDI-ноты вуайсинга без тоники (для Rhodes/пэда), диапазон 53..64 */
  notes: number[]
  /** MIDI баса 36..47 */
  bass: number
  /** начало в 16-х шагах от начала фразы */
  startStep: number
  steps: number
}

export interface Progression {
  /** id шаблона (без учёта длины) */
  templateId: string
  bars: 4 | 8
  chords: Chord[]
}

type Slot = [semi: number, qualities: ChordQuality[], beats: number]
interface Template { id: string; slots: Slot[] }

const TEMPLATES: Template[] = [
  { id: 'I-vi-ii-V', slots: [[0, ['maj7', 'maj9'], 4], [9, ['min7', 'min9'], 4], [2, ['min9', 'min7'], 4], [7, ['dom9', 'dom7'], 4]] },
  { id: 'ii-V-I-vi', slots: [[2, ['min9', 'min7'], 4], [7, ['dom9'], 4], [0, ['maj9', 'maj7'], 4], [9, ['min7', 'min11'], 4]] },
  { id: 'I-IV-iii-vi', slots: [[0, ['maj9'], 4], [5, ['maj7'], 4], [4, ['min7'], 4], [9, ['min9'], 4]] },
  { id: 'ii-V-I-bVI', slots: [[2, ['min7', 'min9'], 4], [7, ['dom9'], 4], [0, ['maj7'], 4], [8, ['maj7'], 4]] },
  { id: 'I-bIII-IV-iv', slots: [[0, ['maj9'], 4], [3, ['maj7'], 4], [5, ['maj7'], 4], [5, ['min7'], 4]] },
  { id: 'vi-ii-V-I', slots: [[9, ['min9'], 4], [2, ['min11', 'min9'], 4], [7, ['dom9'], 4], [0, ['maj7', 'maj9'], 4]] },
  { id: 'IV-V-iii-vi', slots: [[5, ['maj9'], 4], [7, ['dom7'], 4], [4, ['min7'], 4], [9, ['min7'], 4]] },
  { id: 'I-iii-IV-iiV', slots: [[0, ['maj7'], 4], [4, ['min7'], 4], [5, ['maj9'], 4], [2, ['min7'], 2], [7, ['dom9'], 2]] },
  { id: 'vi-IV-I-V', slots: [[9, ['min9'], 4], [5, ['maj7'], 4], [0, ['maj9'], 4], [7, ['dom9'], 4]] },
  { id: 'ii-bII-I-vi', slots: [[2, ['min9'], 4], [1, ['maj7'], 4], [0, ['maj9'], 4], [9, ['min7'], 4]] },
]

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id)

export function voiceChord(rootPc: number, quality: ChordQuality): { notes: number[]; bass: number } {
  const ivs = INTERVALS[quality].filter((iv) => iv !== 0)
  // у расширенных аккордов убираем квинту, чтобы звучало прозрачнее
  const tones = ivs.length >= 4 ? ivs.filter((iv) => iv !== 7) : ivs
  const notes = tones.map((iv) => 53 + mod(rootPc + iv - 53, 12)).sort((a, b) => a - b)
  return { notes, bass: 36 + rootPc }
}

export function chordSymbol(rootPc: number, quality: ChordQuality): string {
  return NOTE_NAMES[mod(rootPc, 12)] + SUFFIX[quality]
}

/** Pitch-classes (0..11) ступеней мажорной гаммы тональности. */
export function majorScalePcs(keyPc: number): number[] {
  return [0, 2, 4, 5, 7, 9, 11].map((s) => mod(keyPc + s, 12))
}

export function chordPcs(chord: Pick<Chord, 'rootPc' | 'quality'>): number[] {
  return INTERVALS[chord.quality].map((iv) => mod(chord.rootPc + iv, 12))
}

function buildChords(rng: Rng, tpl: Template, keyPc: number, startStep: number, lastOverride?: Slot): Chord[] {
  const out: Chord[] = []
  let step = startStep
  const slots = lastOverride ? [...tpl.slots.slice(0, -1), lastOverride] : tpl.slots
  for (const [semi, quals, beats] of slots) {
    const quality = pick(rng, quals)
    const rootPc = mod(keyPc + semi, 12)
    const { notes, bass } = voiceChord(rootPc, quality)
    const steps = beats * 4
    out.push({ symbol: chordSymbol(rootPc, quality), rootPc, quality, notes, bass, startStep: step, steps })
    step += steps
  }
  return out
}

/**
 * Генерирует прогрессию на 4 или 8 тактов в тональности keyPc.
 * Шаблон никогда не совпадает с `prevTemplateId` (нет повторов подряд).
 */
export function generateProgression(rng: Rng, keyPc: number, bars: 4 | 8, prevTemplateId?: string | null): Progression {
  const pool = TEMPLATES.filter((t) => t.id !== prevTemplateId)
  const tpl = pick(rng, pool)
  let chords = buildChords(rng, tpl, keyPc, 0)
  if (bars === 8) {
    // вторая половина: тот же шаблон, иногда с turnaround на V
    const turn: Slot = [7, ['dom9', 'dom7'], tpl.slots[tpl.slots.length - 1][2]]
    chords = chords.concat(buildChords(rng, tpl, keyPc, 64, rng() < 0.5 ? turn : undefined))
  }
  return { templateId: tpl.id, bars, chords }
}

export function chordAtStep(prog: Progression, step: number): Chord {
  for (let i = prog.chords.length - 1; i >= 0; i--) if (step >= prog.chords[i].startStep) return prog.chords[i]
  return prog.chords[0]
}
