// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  CELL_H_M,
  CORNICE_M,
  corniceHeight,
  floorCount,
  floorHeight,
  KIND_PALETTE,
  litFraction,
  type Rgb01,
  paletteColor,
  plinthHeight,
  PLINTH_M,
  windowZone,
} from './facadeMaterial'

const KINDS = [0, 1, 2, 3]
const c: Rgb01 = { r: 0, g: 0, b: 0 }

describe('litFraction', () => {
  it('в 0..1 и монотонна по night для каждого вида', () => {
    for (const k of KINDS) {
      let prev = -1
      for (let i = 0; i <= 20; i++) {
        const f = litFraction(i / 20, k)
        expect(Number.isFinite(f)).toBe(true)
        expect(f).toBeGreaterThanOrEqual(0)
        expect(f).toBeLessThanOrEqual(1)
        expect(f).toBeGreaterThanOrEqual(prev)
        prev = f
      }
    }
  })
  it('значения Плана: 0.18 днём, 0.68 ночью; офисы реже', () => {
    expect(litFraction(0, 0)).toBeCloseTo(0.18, 6)
    expect(litFraction(1, 0)).toBeCloseTo(0.68, 6)
    expect(litFraction(1, 1)).toBeLessThan(litFraction(1, 0))
  })
  it('night вне диапазона ограничивается', () => {
    expect(litFraction(-3, 0)).toBeCloseTo(0.18, 6)
    expect(litFraction(9, 0)).toBeCloseTo(0.68, 6)
  })
})

describe('paletteColor', () => {
  it('детерминирована и конечна', () => {
    for (const k of KINDS) {
      for (let i = 0; i <= 40; i++) {
        const a = { ...paletteColor(k, i / 40, { r: 0, g: 0, b: 0 }) }
        const b = paletteColor(k, i / 40, c)
        expect(b).toEqual(a)
        for (const v of [a.r, a.g, a.b]) expect(Number.isFinite(v)).toBe(true)
      }
    }
  })
  it('нет чистого серого, чёрного и белого', () => {
    for (const k of KINDS) {
      for (let i = 0; i <= 100; i++) {
        const { r, g, b } = paletteColor(k, i / 100, c)
        const mx = Math.max(r, g, b)
        const mn = Math.min(r, g, b)
        expect(mx).toBeLessThan(0.97)
        expect(mx).toBeGreaterThan(0.2)
        expect((mx - mn) / mx).toBeGreaterThan(0.05)
      }
    }
  })
  it('в палитре 4 вида по 4 оттенка', () => {
    expect(KIND_PALETTE.length).toBe(4)
    for (const p of KIND_PALETTE) expect(p.length).toBe(4)
  })
})

describe('сетка этажей', () => {
  it('дом высотой H даёт ≈ H / 3.2 этажей над цоколем и карнизом', () => {
    for (const k of [0, 2]) {
      for (const h of [12, 20, 32, 48, 75]) {
        const n = floorCount(h, k)
        const expected = (h - PLINTH_M - corniceHeight(h, k)) / CELL_H_M
        expect(Math.abs(n - expected)).toBeLessThanOrEqual(0.5)
        expect(Number.isInteger(n)).toBe(true)
      }
    }
  })
  it('конкретно: 20 м жилой → 5 этажей, 32 м исторический → 8', () => {
    expect(floorCount(20, 0)).toBe(5)
    expect(floorCount(32, 2)).toBe(9)
  })
  it('низкие здания: минимум один этаж, высота этажа конечна и > 0', () => {
    for (const h of [0.5, 2, 3, 6, 9]) {
      expect(floorCount(h, 0)).toBeGreaterThanOrEqual(1)
      const f = floorHeight(h, 0)
      expect(Number.isFinite(f)).toBe(true)
      expect(f).toBeGreaterThan(0)
    }
  })
  it('цоколь, карниз и зона складываются в высоту дома; шаг этажа ≈ 3.2 м', () => {
    for (const h of [12, 20, 32, 60]) {
      expect(plinthHeight(h) + corniceHeight(h, 0) + windowZone(h, 0)).toBeCloseTo(h, 6)
      expect(Math.abs(floorHeight(h, 0) - CELL_H_M)).toBeLessThan(0.7)
    }
    expect(corniceHeight(100, 0)).toBe(CORNICE_M)
    expect(plinthHeight(100)).toBe(PLINTH_M)
  })
})
