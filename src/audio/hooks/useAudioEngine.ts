import { useCallback } from 'react'
import { audioLifecycle } from '../core/AudioLifecycleManager'

/**
 * Тонкая обёртка для React. Звук живёт в AudioLifecycleManager независимо от UI:
 * размонтирование компонентов, перерисовки и скрытие страницы его не останавливают.
 * start() — только по жесту пользователя (политика автозапуска браузеров), идемпотентен.
 */
export function useAudioEngine(): { start: () => Promise<void> } {
  const start = useCallback(() => audioLifecycle.start(), [])
  return { start }
}
