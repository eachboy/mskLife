import { useEffect } from 'react'

/** Через сколько без движения мыши UI прячется, мс. */
export const ZEN_IDLE_MS = 12_000

/**
 * Zen Mode: после ZEN_IDLE_MS без движения мыши/нажатий (и без открытых панелей/карты) ставит
 * data-zen="1" на <html>; CSS (.zen-ui) плавно скрывает панели и оверлеи. Любое движение, касание
 * или клавиша возвращают интерфейс сразу. Без ререндеров React: один таймер и атрибут на корне.
 */
export function useZenMode(enabled: boolean): void {
  useEffect(() => {
    const root = document.documentElement
    if (!enabled) {
      delete root.dataset.zen
      return
    }
    let timer = 0
    const arm = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        root.dataset.zen = '1'
      }, ZEN_IDLE_MS)
    }
    const wake = () => {
      if (root.dataset.zen) delete root.dataset.zen
      arm()
    }
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    for (const e of events) window.addEventListener(e, wake, { passive: true, capture: true })
    arm()
    return () => {
      window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, wake, { capture: true })
      delete root.dataset.zen
    }
  }, [enabled])
}
