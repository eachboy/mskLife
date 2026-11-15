import { LOCATIONS } from '../data/locations'
import { weatherManager } from '../features/weather/WeatherManager'
import { scenarioEngine } from '../simulation/engine/ScenarioEngine'
import { WEATHER_PRESETS, isSnowy, simTemperature } from '../features/weather/weatherData'
import { useWorldStore } from '../stores/worldStore'
import type { CharacterPose, EventKind, LocationId, Season, WeatherKind } from '../types'

/** Только для разработки/скриншотов: window.__ml(location, weather, minutes). */
export function installDevHooks() {
  const w = window as unknown as { __ml?: (loc: LocationId, weather: WeatherKind, minutes: number) => void }
  w.__ml = (loc, weather, minutes) => {
    // иначе ScenarioEngine перехватит локацию и время сразу после установки
    scenarioEngine.stop()
    weatherManager.stop()
    const def = LOCATIONS[loc]
    const poses: Partial<Record<string, [EventKind, CharacterPose]>> = {
      park: ['bench', 'sit'], street: ['stroll', 'walk'], cafe: ['cafe', 'drink'], office: ['work', 'type'], home: ['home-night', 'read'],
      'metro-station': ['metro-down', 'walk'], 'metro-ride': ['metro-ride', 'sit'], bus: ['bus-ride', 'sit'], courtyard: ['courtyard', 'sit'],
    }
    const [kind, pose] = poses[def.kind] ?? ['stroll', 'walk']
    const preset = WEATHER_PRESETS[weather]
    // сезон по реальной дате; снег — всегда зима; дождь/гроза зимой → весна (без противоречий)
    const m = new Date().getMonth()
    const cur: Season = m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'
    const season: Season = isSnowy(weather) ? 'winter' : cur === 'winter' && preset.params.rain > 0 ? 'spring' : cur
    const temperature = simTemperature(season, weather, minutes)
    useWorldStore.setState((s) => ({
      paused: false, season, temperature, location: loc, transitionTo: null, minutes, weatherKind: weather, weather: { ...preset.params },
      snowCover: preset.params.snow > 0 ? 0.9 : 0, wetness: preset.params.rain > 0 ? 0.8 : 0, eventKey: s.eventKey + 1,
      event: { id: 'dev', kind, location: loc, anchor: def.outdoor ? loc : 'arbat', duration: 40, pose, caption: '' },
    }))
  }
}
