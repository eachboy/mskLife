import { useWorldStore } from '../../stores/worldStore'
import type { WeatherParams } from '../../types'
import { eventBus } from '../../utils/eventBus'
import { clamp, lerp } from '../../utils/math'
import { WEATHER_PRESETS, isRainy, isSnowy } from './weatherData'

const KEYS: (keyof WeatherParams)[] = ['cloud', 'rain', 'snow', 'fog', 'wind', 'storm']

/**
 * Плавно ведёт текущие параметры погоды к целевым (≈5 Гц), накапливает снег и
 * влажность асфальта, генерирует молнии. Не зависит от React.
 */
export class WeatherTransitionManager {
  private timer: ReturnType<typeof setInterval> | null = null
  private nextLightning = 0
  /** секунд на полный переход ≈ 1/rate */
  private rate = 0.12
  private tickMs = 200

  start() {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(this.tickMs / 1000), this.tickMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  tick(dt: number) {
    const s = useWorldStore.getState()
    if (s.paused) return
    const target = WEATHER_PRESETS[s.weatherKind].params
    const k = 1 - Math.exp(-this.rate * dt)
    const next = { ...s.weather }
    for (const key of KEYS) next[key] = lerp(next[key], target[key], k)

    // накопление снега / мокрый асфальт
    let snowCover = s.snowCover
    let wetness = s.wetness
    const winter = s.season === 'winter'
    if (isSnowy(s.weatherKind)) snowCover = clamp(snowCover + dt * 0.012 * next.snow)
    else snowCover = clamp(snowCover - dt * (winter ? 0.0006 : 0.01) * (1 + (s.temperature > 0 ? 1 : 0)))
    if (winter) snowCover = Math.max(snowCover, 0.55)
    if (isRainy(s.weatherKind)) wetness = clamp(wetness + dt * 0.06 * next.rain)
    else wetness = clamp(wetness - dt * (0.012 + next.cloud * -0.004))

    s.patch({ weather: next, snowCover, wetness })

    // молнии
    if (next.storm > 0.5) {
      this.nextLightning -= dt
      if (this.nextLightning <= 0) {
        this.nextLightning = 4 + Math.random() * 11
        const distance = Math.random()
        useWorldStore.setState((st) => ({ lightningFlash: st.lightningFlash + 1 }))
        eventBus.emit('lightning', { distance })
      }
    } else {
      this.nextLightning = 3 + Math.random() * 3
    }
  }
}
