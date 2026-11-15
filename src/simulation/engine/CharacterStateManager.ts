import type { Season, WeatherKind } from '../../types'
import { isRainy } from '../../features/weather/weatherData'

export interface CharacterLook {
  umbrella: boolean
  coat: 'light' | 'jacket' | 'winter'
  scarf: boolean
  hat: boolean
  /** пар изо рта */
  breath: boolean
}

/** Одежда и аксессуары зависят от температуры, сезона и погоды. */
export function deriveLook(season: Season, temperature: number, weather: WeatherKind, outdoor: boolean): CharacterLook {
  const cold = temperature <= 0
  const cool = temperature <= 10
  return {
    umbrella: outdoor && isRainy(weather) && weather !== 'thunderstorm' ? true : outdoor && weather === 'thunderstorm',
    coat: cold || season === 'winter' ? 'winter' : cool ? 'jacket' : 'light',
    scarf: cold || (season === 'winter' && temperature < 3),
    hat: cold,
    breath: outdoor && temperature <= 2,
  }
}
