import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QUALITY_KEY, effectiveQuality, readInitialQuality, useWorldStore } from './worldStore'

describe('worldStore: quality', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => window.localStorage.clear())

  it('по умолчанию high', () => {
    expect(readInitialQuality()).toBe('high')
  })

  it('мусор в localStorage игнорируется', () => {
    window.localStorage.setItem(QUALITY_KEY, 'ultra')
    expect(readInitialQuality()).toBe('high')
  })

  it('quality читается из localStorage', () => {
    window.localStorage.setItem(QUALITY_KEY, 'medium')
    expect(readInitialQuality()).toBe('medium')
  })

  it('setQuality пишет в стор и localStorage', () => {
    useWorldStore.getState().setQuality('low')
    expect(useWorldStore.getState().quality).toBe('low')
    expect(window.localStorage.getItem(QUALITY_KEY)).toBe('low')
    useWorldStore.getState().setQuality('high')
  })

  it('patch не пишет в localStorage', () => {
    useWorldStore.getState().patch({ quality: 'medium' })
    expect(window.localStorage.getItem(QUALITY_KEY)).toBeNull()
    useWorldStore.getState().patch({ quality: 'high' })
  })

  it('effectiveQuality: lowPerf принудительно low, иначе выбранное', () => {
    expect(effectiveQuality({ lowPerf: true, quality: 'high' })).toBe('low')
    expect(effectiveQuality({ lowPerf: false, quality: 'medium' })).toBe('medium')
    expect(effectiveQuality({ lowPerf: false, quality: 'high' })).toBe('high')
  })
})
