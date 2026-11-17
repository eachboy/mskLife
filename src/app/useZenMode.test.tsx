import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useZenMode, ZEN_IDLE_MS } from './useZenMode'

describe('useZenMode', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('прячет UI через 12 с покоя и возвращает по движению мыши', () => {
    renderHook(() => useZenMode(true))
    const root = document.documentElement
    act(() => void vi.advanceTimersByTime(ZEN_IDLE_MS - 100))
    expect(root.dataset.zen).toBeUndefined()
    act(() => void vi.advanceTimersByTime(200))
    expect(root.dataset.zen).toBe('1')
    act(() => void window.dispatchEvent(new Event('pointermove')))
    expect(root.dataset.zen).toBeUndefined()
    act(() => void vi.advanceTimersByTime(ZEN_IDLE_MS + 10))
    expect(root.dataset.zen).toBe('1')
    act(() => void window.dispatchEvent(new Event('keydown')))
    expect(root.dataset.zen).toBeUndefined()
  })

  it('не включается при enabled=false (открыта панель) и снимается при размонтировании', () => {
    const { rerender, unmount } = renderHook(({ on }) => useZenMode(on), { initialProps: { on: true } })
    act(() => void vi.advanceTimersByTime(ZEN_IDLE_MS + 10))
    expect(document.documentElement.dataset.zen).toBe('1')
    rerender({ on: false })
    expect(document.documentElement.dataset.zen).toBeUndefined()
    act(() => void vi.advanceTimersByTime(ZEN_IDLE_MS * 2))
    expect(document.documentElement.dataset.zen).toBeUndefined()
    unmount()
  })
})
