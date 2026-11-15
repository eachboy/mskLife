import { type Rng, chance, clamp, mod, pick, randInt } from './rng'
import { type Progression, chordAtStep, chordPcs, majorScalePcs } from './ChordGenerator'

export interface MelodyNote {
  /** шаг 16-х от начала фразы */
  step: number
  midi: number
  /** длительность в 16-х */
  len: number
  vel: number
}

export const MELODY_LO = 64
export const MELODY_HI = 83

/** Ритмические мотивы одного такта: [позиция 16-й, длительность]. */
const RHYTHMS: Array<Array<[number, number]>> = [
  [[0, 6], [8, 4], [12, 4]],
  [[2, 4], [6, 2], [8, 8]],
  [[0, 3], [4, 4], [10, 6]],
  [[4, 6], [10, 2], [12, 4]],
  [[0, 2], [3, 3], [8, 4], [14, 2]],
  [[6, 6], [12, 4]],
  [[0, 8], [10, 6]],
  [[2, 2], [4, 2], [8, 6], [14, 2]],
]

export interface Motif {
  /** индекс ритма на такт (длина 4, повторяется) */
  rhythms: number[]
  /** шаги блуждания по гамме, циклически */
  contour: number[]
}

export function generateMotif(rng: Rng): Motif {
  const rhythms = Array.from({ length: 4 }, () => randInt(rng, 0, RHYTHMS.length - 1))
  rhythms[2] = rhythms[0]
  const contour = Array.from({ length: 12 }, () => pick(rng, [-2, -1, -1, 0, 1, 1, 2, 3, -3]))
  return { rhythms, contour }
}

export function scaleNotes(keyPc: number, lo = MELODY_LO, hi = MELODY_HI): number[] {
  const pcs = new Set(majorScalePcs(keyPc))
  const out: number[] = []
  for (let m = lo; m <= hi; m++) if (pcs.has(mod(m, 12))) out.push(m)
  return out
}

/**
 * Мелодия фразы: только ноты мажорной гаммы тональности; на сильных долях тянется к аккордовым тонам.
 * density 0..1 — доля сохраняемых нот (ночью/в дождь реже).
 */
export function generateMelody(rng: Rng, prog: Progression, keyPc: number, motif: Motif, density = 0.8): MelodyNote[] {
  const scale = scaleNotes(keyPc)
  const notes: MelodyNote[] = []
  let idx = Math.floor(scale.length / 2) + randInt(rng, -2, 2)
  let ci = 0
  for (let bar = 0; bar < prog.bars; bar++) {
    const rhythm = RHYTHMS[motif.rhythms[bar % 4]]
    const lastBar = bar === prog.bars - 1
    for (const [pos, len] of rhythm) {
      if (!chance(rng, density) && !(pos === 0 && bar % 4 === 0)) {
        ci++
        continue
      }
      idx = clamp(
        idx + motif.contour[ci % motif.contour.length] + (chance(rng, 0.15) ? pick(rng, [-2, 2]) : 0),
        0,
        scale.length - 1,
      )
      ci++
      const step = bar * 16 + pos
      if (pos % 4 === 0 || lastBar) {
        const tones = chordPcs(chordAtStep(prog, step))
        let best = idx
        let bd = 99
        for (let i = 0; i < scale.length; i++) {
          if (!tones.includes(mod(scale[i], 12))) continue
          const d = Math.abs(i - idx)
          if (d < bd) {
            bd = d
            best = i
          }
        }
        if (bd <= 2) idx = best
      }
      notes.push({
        step,
        midi: scale[idx],
        len: Math.max(1, Math.min(len, prog.bars * 16 - step)),
        vel: 0.35 + rng() * 0.3 + (pos % 8 === 0 ? 0.1 : 0),
      })
    }
  }
  return notes
}
