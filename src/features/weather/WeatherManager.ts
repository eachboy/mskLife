import { fetchMoscowWeather } from '../../services/weather/openMeteo'
import { useWorldStore } from '../../stores/worldStore'
import type { WeatherKind } from '../../types'
import { weightedPick } from '../../utils/math'
import { SEASON_WEIGHTS, WEATHER_PRESETS, simTemperature } from './weatherData'
import { WeatherTransitionManager } from './WeatherTransitionManager'

/** Выбор следующей погоды в симуляции (чистая функция — удобно тестировать). */
export function nextSimulatedWeather(
  current: WeatherKind,
  season: keyof typeof SEASON_WEIGHTS,
  rng: () => number = Math.random,
): WeatherKind {
  const w = SEASON_WEIGHTS[season]
  const items = (Object.keys(w) as WeatherKind[]).map((k) => ({
    item: k,
    // слегка «липнем» к текущей, чтобы погода менялась логично, а не скачками
    w: (w[k] ?? 0) * (k === current ? 0.4 : 1) * smoothness(current, k),
  }))
  return weightedPick(items, rng)
}

function smoothness(a: WeatherKind, b: WeatherKind): number {
  const calm: WeatherKind[] = ['clear', 'partly-cloudy', 'overcast']
  const wet: WeatherKind[] = ['light-rain', 'heavy-rain', 'thunderstorm']
  const snow: WeatherKind[] = ['snow', 'heavy-snow']
  // из ясного сразу в грозу/сильный снег — редко
  if (a === 'clear' && (b === 'thunderstorm' || b === 'heavy-rain' || b === 'heavy-snow')) return 0.15
  if (wet.includes(a) && snow.includes(b)) return 0.2
  if (calm.includes(a) && b === 'thunderstorm') return 0.4
  return 1
}

/**
 * Управляет «какая сейчас погода»: симуляция (марковский выбор по сезону) либо
 * реальная погода Москвы (Open-Meteo) с безопасным откатом на симуляцию.
 */
export class WeatherManager {
  readonly transition = new WeatherTransitionManager()
  private changeTimer: ReturnType<typeof setTimeout> | null = null
  private realTimer: ReturnType<typeof setInterval> | null = null
  private tempTimer: ReturnType<typeof setInterval> | null = null
  private running = false

  start() {
    if (this.running) return
    this.running = true
    this.transition.start()
    this.applyKind(useWorldStore.getState().weatherKind)
    this.tempTimer = setInterval(() => this.updateTemperature(), 5000)
    this.setSource(useWorldStore.getState().weatherSource)
  }

  stop() {
    this.running = false
    this.transition.stop()
    if (this.changeTimer) clearTimeout(this.changeTimer)
    if (this.realTimer) clearInterval(this.realTimer)
    if (this.tempTimer) clearInterval(this.tempTimer)
    this.changeTimer = this.realTimer = this.tempTimer = null
  }

  /** Явно задать погоду (сценарий «дождливый день», выбор пользователем). */
  force(kind: WeatherKind) {
    this.applyKind(kind)
    if (useWorldStore.getState().weatherSource === 'simulation') this.scheduleNext()
  }

  setSource(source: 'simulation' | 'real') {
    useWorldStore.getState().patch({ weatherSource: source })
    if (this.changeTimer) clearTimeout(this.changeTimer)
    if (this.realTimer) clearInterval(this.realTimer)
    this.changeTimer = this.realTimer = null
    if (source === 'real') {
      void this.pullReal()
      this.realTimer = setInterval(() => void this.pullReal(), 10 * 60 * 1000)
    } else {
      this.scheduleNext()
    }
  }

  private async pullReal() {
    const real = await fetchMoscowWeather()
    if (!this.running) return
    if (!real) {
      // API недоступно — тихо откатываемся на симуляцию
      useWorldStore.getState().patch({ weatherSource: 'simulation' })
      if (this.realTimer) clearInterval(this.realTimer)
      this.realTimer = null
      this.scheduleNext()
      return
    }
    this.applyKind(real.kind, real.temperature)
  }

  private scheduleNext() {
    if (this.changeTimer) clearTimeout(this.changeTimer)
    // каждые 1.5–4 минуты реального времени
    const ms = (90 + Math.random() * 150) * 1000
    this.changeTimer = setTimeout(() => {
      const s = useWorldStore.getState()
      if (s.weatherSource !== 'simulation' || !this.running) return
      if (!s.paused && s.scenarioMode !== 'rainy' && s.scenarioMode !== 'winter') {
        this.applyKind(nextSimulatedWeather(s.weatherKind, s.season))
      }
      this.scheduleNext()
    }, ms)
  }

  private applyKind(kind: WeatherKind, realTemp?: number) {
    const s = useWorldStore.getState()
    const changed = kind !== s.weatherKind
    const temp = realTemp ?? this.simTemp(kind)
    s.patch({ weatherKind: kind, temperature: temp })
    if (changed && s.started) s.setCaption(WEATHER_PRESETS[kind].caption)
  }

  private simTemp(kind: WeatherKind) {
    const s = useWorldStore.getState()
    return simTemperature(s.season, kind, s.minutes)
  }

  private updateTemperature() {
    const s = useWorldStore.getState()
    if (s.weatherSource !== 'simulation') return
    const t = this.simTemp(s.weatherKind)
    if (t !== s.temperature) s.patch({ temperature: t }) // пустой patch будил бы все селекторы стора каждые 5 с
  }
}

export const weatherManager = new WeatherManager()
