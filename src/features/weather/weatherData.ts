import type { Season, WeatherKind, WeatherParams } from '../../types'

export interface WeatherPreset {
  label: string
  params: WeatherParams
  /** изменение температуры относительно сезонной нормы */
  dTemp: number
  icon: 'sun' | 'cloud-sun' | 'cloud' | 'cloud-drizzle' | 'cloud-rain' | 'cloud-lightning' | 'snowflake' | 'cloud-snow' | 'cloud-fog' | 'wind'
  caption: string
}

export const WEATHER_PRESETS: Record<WeatherKind, WeatherPreset> = {
  clear: { label: 'Ясно', params: { cloud: 0.08, rain: 0, snow: 0, fog: 0, wind: 0.12, storm: 0 }, dTemp: 3, icon: 'sun', caption: 'Небо расчищается — над городом ясно' },
  'partly-cloudy': { label: 'Переменная облачность', params: { cloud: 0.5, rain: 0, snow: 0, fog: 0, wind: 0.25, storm: 0 }, dTemp: 0, icon: 'cloud-sun', caption: 'Над крышами плывут облака' },
  overcast: { label: 'Пасмурно', params: { cloud: 0.95, rain: 0, snow: 0, fog: 0.1, wind: 0.2, storm: 0 }, dTemp: -2, icon: 'cloud', caption: 'Небо затянуло серой дымкой' },
  'light-rain': { label: 'Лёгкий дождь', params: { cloud: 0.85, rain: 0.4, snow: 0, fog: 0.12, wind: 0.2, storm: 0 }, dTemp: -3, icon: 'cloud-drizzle', caption: 'Начинается небольшой дождь' },
  'heavy-rain': { label: 'Сильный дождь', params: { cloud: 1, rain: 1, snow: 0, fog: 0.2, wind: 0.5, storm: 0 }, dTemp: -4, icon: 'cloud-rain', caption: 'Дождь усиливается, мостовая блестит' },
  thunderstorm: { label: 'Гроза', params: { cloud: 1, rain: 0.9, snow: 0, fog: 0.15, wind: 0.7, storm: 1 }, dTemp: -3, icon: 'cloud-lightning', caption: 'Над Москвой собирается гроза' },
  snow: { label: 'Снег', params: { cloud: 0.8, rain: 0, snow: 0.45, fog: 0.15, wind: 0.15, storm: 0 }, dTemp: -6, icon: 'snowflake', caption: 'Пошёл мягкий снег' },
  'heavy-snow': { label: 'Сильный снегопад', params: { cloud: 1, rain: 0, snow: 1, fog: 0.35, wind: 0.35, storm: 0 }, dTemp: -9, icon: 'cloud-snow', caption: 'Снегопад заметает улицы' },
  fog: { label: 'Туман', params: { cloud: 0.7, rain: 0, snow: 0, fog: 0.9, wind: 0.05, storm: 0 }, dTemp: -2, icon: 'cloud-fog', caption: 'Город укутывает туман' },
  windy: { label: 'Ветер', params: { cloud: 0.55, rain: 0, snow: 0, fog: 0, wind: 1, storm: 0 }, dTemp: -2, icon: 'wind', caption: 'Поднимается сильный ветер' },
}

export const WEATHER_KINDS = Object.keys(WEATHER_PRESETS) as WeatherKind[]

/** Базовая температура по сезону (°C, дневной ход добавляется отдельно). */
export const SEASON_TEMP: Record<Season, number> = { winter: -7, spring: 9, summer: 22, autumn: 7 }

/** Веса переходов в симуляции: какая погода вероятна в сезоне. */
export const SEASON_WEIGHTS: Record<Season, Partial<Record<WeatherKind, number>>> = {
  winter: { clear: 2, 'partly-cloudy': 2, overcast: 3, snow: 4, 'heavy-snow': 1.5, fog: 1, windy: 1 },
  spring: { clear: 3, 'partly-cloudy': 3, overcast: 2, 'light-rain': 2.5, 'heavy-rain': 0.8, fog: 0.8, windy: 1.5, snow: 0.2 },
  summer: { clear: 5, 'partly-cloudy': 3, overcast: 1, 'light-rain': 1.5, 'heavy-rain': 1, thunderstorm: 1.2, windy: 0.8 },
  autumn: { clear: 1.5, 'partly-cloudy': 2.5, overcast: 3, 'light-rain': 3, 'heavy-rain': 1.5, fog: 1.5, windy: 2, thunderstorm: 0.2 },
}

/** Дневной ход температуры: минимум ~5:00, максимум ~15:00. */
export function dailyTempOffset(minutes: number): number {
  const h = minutes / 60
  return Math.cos(((h - 15) / 24) * Math.PI * 2) * 3.5
}

export function isRainy(k: WeatherKind) {
  return k === 'light-rain' || k === 'heavy-rain' || k === 'thunderstorm'
}
export function isSnowy(k: WeatherKind) {
  return k === 'snow' || k === 'heavy-snow'
}

/** Температура симуляции: сезон + суточный ход + погода, с физичными пределами (снег ≤ 0, дождь/гроза > 0). */
export function simTemperature(season: Season, kind: WeatherKind, minutes: number): number {
  let t = Math.round(SEASON_TEMP[season] + dailyTempOffset(minutes) + WEATHER_PRESETS[kind].dTemp * 0.5)
  if (isSnowy(kind)) t = Math.min(t, kind === 'heavy-snow' ? -3 : -1)
  if (isRainy(kind)) t = Math.max(t, kind === 'thunderstorm' ? 6 : 2)
  return t
}
