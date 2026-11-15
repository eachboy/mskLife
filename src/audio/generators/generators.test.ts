import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'
import { generateProgression, majorScalePcs, TEMPLATE_IDS } from './ChordGenerator'
import { generateMelody, generateMotif } from './MelodyGenerator'
import { drumBarsFor, generateDrumPattern } from './DrumGenerator'
import { Arranger, dayPartOf } from './ArrangementGenerator'

describe('rng', () => {
  it('детерминирован', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    const v = mulberry32(1)()
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })
})

describe('ChordGenerator', () => {
  it('аккорды в допустимом диапазоне, длительности суммируются в такты', () => {
    const rng = mulberry32(7)
    for (let key = 0; key < 12; key++) {
      for (const bars of [4, 8] as const) {
        const p = generateProgression(rng, key, bars)
        let total = 0
        for (const c of p.chords) {
          expect(c.notes.length).toBeGreaterThanOrEqual(2)
          for (const n of c.notes) {
            expect(n).toBeGreaterThanOrEqual(48)
            expect(n).toBeLessThanOrEqual(84)
          }
          expect(c.bass).toBeGreaterThanOrEqual(28)
          expect(c.bass).toBeLessThanOrEqual(52)
          expect(c.startStep).toBe(total)
          total += c.steps
        }
        expect(total).toBe(bars * 16)
      }
    }
  })

  it('нет повторов одной и той же прогрессии подряд', () => {
    const rng = mulberry32(99)
    let prev: string | null = null
    for (let i = 0; i < 200; i++) {
      const p = generateProgression(rng, i % 12, i % 3 === 0 ? 8 : 4, prev)
      expect(p.templateId).not.toBe(prev)
      expect(TEMPLATE_IDS).toContain(p.templateId)
      prev = p.templateId
    }
  })
})

describe('MelodyGenerator', () => {
  it('мелодия остаётся в тональности', () => {
    const rng = mulberry32(5)
    for (let key = 0; key < 12; key++) {
      const prog = generateProgression(rng, key, 8)
      const m = generateMelody(rng, prog, key, generateMotif(rng), 0.9)
      const scale = new Set(majorScalePcs(key))
      expect(m.length).toBeGreaterThan(0)
      for (const n of m) {
        expect(scale.has(n.midi % 12)).toBe(true)
        expect(n.step).toBeGreaterThanOrEqual(0)
        expect(n.step + n.len).toBeLessThanOrEqual(8 * 16)
      }
    }
  })
})

describe('DrumGenerator', () => {
  it('16 шагов, значения 0..1', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 30; i++) {
      const bars = drumBarsFor(rng, generateDrumPattern(rng, rng()), 8)
      expect(bars).toHaveLength(8)
      for (const b of bars) {
        for (const lane of [b.kick, b.snare, b.hat, b.openHat]) {
          expect(lane).toHaveLength(16)
          for (const v of lane) {
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  })
})

describe('Arranger', () => {
  it('темп 65..90, свинг 0.55..0.6, прогрессии не повторяются, ночью медленнее', () => {
    const arr = new Arranger(mulberry32(11))
    let prev: string | null = null
    for (let i = 0; i < 60; i++) {
      const p = arr.next({ minutes: 14 * 60, rain: 0 })
      expect(p.bpm).toBeGreaterThanOrEqual(65)
      expect(p.bpm).toBeLessThanOrEqual(90)
      expect(p.swing).toBeGreaterThanOrEqual(0.55)
      expect(p.swing).toBeLessThanOrEqual(0.6)
      expect(p.progression.templateId).not.toBe(prev)
      prev = p.progression.templateId
      expect(p.title).toContain('BPM')
    }
    const night = new Arranger(mulberry32(12))
    for (let i = 0; i < 20; i++) expect(night.next({ minutes: 2 * 60, rain: 0.8 }).bpm).toBeLessThanOrEqual(74)
  })

  it('dayPartOf', () => {
    expect(dayPartOf(120)).toBe('night')
    expect(dayPartOf(12 * 60)).toBe('day')
    expect(dayPartOf(19 * 60)).toBe('dusk')
  })
})
