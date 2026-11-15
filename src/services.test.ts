import { describe, expect, it, vi } from 'vitest'
import { fetchMoscowWeather, mapWmo } from './services/weather/openMeteo'
import { getLighting } from './features/city/lighting'
import { WEATHER_PRESETS } from './features/weather/weatherData'
import { nextSimulatedWeather } from './features/weather/WeatherManager'
import { eventBus } from './utils/eventBus'
import { mulberry32 } from './utils/math'

describe('Open-Meteo', () => {
  it('maps WMO codes', () => {
    expect(mapWmo(0, 5)).toBe('clear')
    expect(mapWmo(95, 5)).toBe('thunderstorm')
    expect(mapWmo(45, 5)).toBe('fog')
    expect(mapWmo(75, 5)).toBe('heavy-snow')
    expect(mapWmo(63, 5)).toBe('light-rain')
  })
  it('parses a good response', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ current: { temperature_2m: 3.6, weather_code: 71, wind_speed_10m: 4 } }) })
    expect(await fetchMoscowWeather(1000, f as never)).toEqual({ kind: 'snow', temperature: 4, windKmh: 4 })
  })
  it('falls back (null) on errors and bad payloads', async () => {
    expect(await fetchMoscowWeather(1000, vi.fn().mockRejectedValue(new Error('net')) as never)).toBeNull()
    expect(await fetchMoscowWeather(1000, vi.fn().mockResolvedValue({ ok: false }) as never)).toBeNull()
    expect(await fetchMoscowWeather(1000, vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as never)).toBeNull()
  })
})

describe('weather', () => {
  it('has 10 presets', () => expect(Object.keys(WEATHER_PRESETS)).toHaveLength(10))
  it('simulation returns a valid state', () => {
    const rng = mulberry32(5)
    for (let i = 0; i < 100; i++) expect(WEATHER_PRESETS[nextSimulatedWeather('clear', 'winter', rng)]).toBeDefined()
  })
})

describe('lighting', () => {
  const clear = WEATHER_PRESETS.clear.params
  it('night is darker than noon, lamps on at night', () => {
    const noon = getLighting(12 * 60, clear, 'summer')
    const night = getLighting(2 * 60, clear, 'summer')
    expect(night.night).toBeGreaterThan(noon.night)
    expect(night.lamps).toBeGreaterThan(noon.lamps)
  })
})

describe('eventBus', () => {
  it('delivers, unsubscribes and survives handler errors', () => {
    const spy = vi.fn()
    const off = eventBus.on('footstep', spy)
    eventBus.on('footstep', () => { throw new Error('x') })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    eventBus.emit('footstep', undefined as never)
    expect(spy).toHaveBeenCalledTimes(1)
    off()
    eventBus.emit('footstep', undefined as never)
    expect(spy).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })
})
