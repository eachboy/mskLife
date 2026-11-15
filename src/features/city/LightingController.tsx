import { useEffect, type RefObject } from 'react'
import { LOCATIONS } from '../../data/locations'
import { useWorldStore } from '../../stores/worldStore'
import { mixHex } from '../../utils/math'
import { getLighting, lightingMonth } from './lighting'

/**
 * Пишет освещение/погоду в CSS-переменные корня сцены — без перерисовки React.
 * Статичный SVG-арт реагирует на это через классы (.win-lit, .lamp-lit, .snow-cap …).
 *
 * Производительность: значение пишется, только если оно изменилось после квантования.
 * Каждая запись переменной инвалидирует стили всех потомков, читающих её, и вызывает перерисовку
 * слоёв — поэтому 2 знака для «медленных» величин и пропуск одинаковых значений.
 */
export function useLightingVars(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const prev = new Map<string, string>()
    const apply = () => {
      const el = ref.current
      if (!el) return
      const s = useWorldStore.getState()
      const l = getLighting(s.minutes, s.weather, s.season, lightingMonth(s.season))
      const set = (k: string, v: string | number) => {
        const str = String(v)
        if (prev.get(k) === str) return
        prev.set(k, str)
        el.style.setProperty(k, str)
      }
      const q = (v: number, d = 2) => v.toFixed(d)
      const outdoor = LOCATIONS[s.location].outdoor
      set('--sky-top', l.skyTop)
      set('--sky-mid', l.skyMid)
      set('--sky-bot', l.skyBottom)
      set('--tint', l.tint)
      set('--tint-a', q(l.tintAlpha * (s.location === 'home' ? 0.5 : outdoor ? 1 : 0.22)))
      // тёплый grade: днём #ffd9b0 .18, вечером #ff9a6b .25, ночью растворяется
      const ev = Math.max(l.golden, 0)
      const indoorK = outdoor ? 1 : 0.6
      set('--grade', mixHex('#ffd9b0', '#ff9a6b', Math.min(1, ev * 1.2)))
      set('--grade-a', q((0.16 + 0.07 * Math.min(1, ev * 1.2)) * (1 - l.night * 0.7) * indoorK))
      set('--night', q(l.night))
      set('--day', q(1 - l.night))
      set('--lamps', q(l.lamps))
      set('--golden', q(l.golden))
      set('--bright', q(outdoor ? l.brightness : 1))
      set('--stars', q(l.stars))
      set('--cloud', q(Math.min(1, 0.12 + s.weather.cloud * 0.95)))
      set('--overcast', q(Math.min(1, s.weather.cloud * 0.7 + s.weather.rain * 0.4 + s.weather.storm * 0.5)))
      set('--snow', q(Math.min(1, s.snowCover)))
      set('--wet', q(s.wetness))
      set('--wind', q(s.weather.wind))
      set('--fog', q(s.weather.fog))
      set('--rain', q(s.weather.rain))
      set('--sun-x', q(l.sun.x, 3))
      set('--sun-y', q(l.sun.y, 3))
      set('--moon-x', q(l.moon.x, 3))
      set('--moon-y', q(l.moon.y, 3))
      set('--sun-o', q(l.sun.opacity))
      set('--moon-o', q(l.moon.visible ? l.night * (1 - s.weather.cloud * 0.9) * (1 - Math.min(1, Math.max(s.weather.rain, s.weather.snow, s.weather.storm) * 1.6)) : 0))
      // ветер — длительность покачивания деревьев (короче при сильном ветре)
      set('--sway-k', q(0.6 + s.weather.wind * 2.2))
    }
    apply()
    const id = setInterval(apply, 250)
    return () => clearInterval(id)
  }, [ref])
}
