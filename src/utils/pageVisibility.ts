/**
 * Единый трекер видимости страницы (Zero-GPU Background Mode).
 * Один слушатель visibilitychange на всё приложение; визуальные циклы (rAF/canvas/частицы/камера)
 * подписываются здесь и полностью останавливаются в скрытой вкладке. Звук и таймер симуляции
 * от этого трекера НЕ зависят — они продолжают работать.
 */

/** Максимальный шаг анимации, с: после часа в фоне ничего не «прыгает». */
export const MAX_FRAME_DT = 0.1

type Listener = (hidden: boolean) => void

const listeners = new Set<Listener>()
let installed = false

const isDoc = (): boolean => typeof document !== 'undefined'

export function isPageHidden(): boolean {
  return isDoc() && document.visibilityState === 'hidden'
}

const notify = () => {
  const h = isPageHidden()
  if (isDoc()) document.documentElement.dataset.pageHidden = h ? '1' : '0'
  for (const fn of [...listeners]) {
    try {
      fn(h)
    } catch (e) {
      console.warn('[visibility] listener', e)
    }
  }
}

/** Подписка на смену видимости. Возвращает отписку; слушатель документа ставится лениво и один. */
export function onPageVisibility(fn: Listener): () => void {
  if (isDoc() && !installed) {
    installed = true
    document.addEventListener('visibilitychange', notify)
    document.documentElement.dataset.pageHidden = isPageHidden() ? '1' : '0'
  }
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Шаг анимации в секундах из сырой разницы времени (с). Никогда не больше MAX_FRAME_DT и не меньше 0. */
export function clampDelta(rawSeconds: number, max = MAX_FRAME_DT): number {
  if (!Number.isFinite(rawSeconds) || rawSeconds < 0) return 0
  return Math.min(rawSeconds, max)
}
