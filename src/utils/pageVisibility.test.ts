import { afterEach, describe, expect, it, vi } from 'vitest'
import { clampDelta, isPageHidden, MAX_FRAME_DT, onPageVisibility } from './pageVisibility'

function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('pageVisibility', () => {
  afterEach(() => setVisibility('visible'))

  it('clampDelta ограничивает шаг после долгого фона', () => {
    expect(clampDelta(3600)).toBe(MAX_FRAME_DT)
    expect(clampDelta(0.016)).toBeCloseTo(0.016)
    expect(clampDelta(-1)).toBe(0)
    expect(clampDelta(Number.NaN)).toBe(0)
  })

  it('уведомляет подписчиков одним слушателем и отписывается', () => {
    const fn = vi.fn()
    const off = onPageVisibility(fn)
    setVisibility('hidden')
    expect(isPageHidden()).toBe(true)
    expect(fn).toHaveBeenLastCalledWith(true)
    expect(document.documentElement.dataset.pageHidden).toBe('1')
    setVisibility('visible')
    expect(fn).toHaveBeenLastCalledWith(false)
    off()
    fn.mockClear()
    setVisibility('hidden')
    expect(fn).not.toHaveBeenCalled()
  })
})
