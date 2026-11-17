import { useEffect, useRef, useState } from 'react'
import { useWorldStore } from '../stores/worldStore'
import { isPageHidden, onPageVisibility } from './pageVisibility'

/**
 * Игровые минуты для UI: целое, квантованное на `step`. В скрытой вкладке значение заморожено —
 * ноль ререндеров и записей стилей; при возврате компонент пересчитывается сразу.
 * Симуляция и звук читают worldStore напрямую и это не затрагивает.
 */
export function useWorldMinutes(step = 1): number {
  const last = useRef(0)
  const [, wake] = useState(0)
  useEffect(() => onPageVisibility((hidden) => !hidden && wake((n) => n + 1)), [])
  return useWorldStore((s) => {
    if (!isPageHidden()) last.current = Math.floor(s.minutes / step) * step
    return last.current
  })
}
