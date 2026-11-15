import type { WeatherKind } from '../../types'

// Москва, Красная площадь
export const MOSCOW = { lat: 55.7558, lng: 37.6173 }

export interface RealWeather {
  kind: WeatherKind
  temperature: number
  windKmh: number
}

/** WMO-коды → наши состояния. */
export function mapWmo(code: number, windKmh: number): WeatherKind {
  if (code === 95 || code === 96 || code === 99) return 'thunderstorm'
  if (code === 45 || code === 48) return 'fog'
  if (code === 71 || code === 73 || code === 77 || code === 85) return 'snow'
  if (code === 75 || code === 86) return 'heavy-snow'
  if (code === 65 || code === 67 || code === 82) return 'heavy-rain'
  if ([51, 53, 55, 56, 57, 61, 63, 66, 80, 81].includes(code)) return 'light-rain'
  if (windKmh > 38 && code < 3) return 'windy'
  if (code === 3) return 'overcast'
  if (code === 1 || code === 2) return 'partly-cloudy'
  return 'clear'
}

/** Получить реальную погоду. Никогда не бросает — возвращает null при ошибке/таймауте. */
export async function fetchMoscowWeather(timeoutMs = 6000, fetchImpl: typeof fetch = fetch): Promise<RealWeather | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${MOSCOW.lat}&longitude=${MOSCOW.lng}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe%2FMoscow`
    const res = await fetchImpl(url, { signal: ctrl.signal })
    if (!res.ok) return null
    const data = await res.json()
    const c = data?.current
    if (!c || typeof c.temperature_2m !== 'number') return null
    const wind = Number(c.wind_speed_10m) || 0
    return { kind: mapWmo(Number(c.weather_code), wind), temperature: Math.round(c.temperature_2m), windKmh: wind }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
