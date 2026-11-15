import { memo, useEffect, useRef } from 'react'
import { LOCATIONS } from '../data/locations'
import { useLightingVars } from '../features/city/LightingController'
import { type GlassRect, WeatherRenderer } from '../features/weather/WeatherRenderer'
import { useWorldStore } from '../stores/worldStore'
import type { LocationId } from '../types'
import { CAFE_GLASS, CafeScene, HomeScene, OfficeScene } from './IndoorScenes'
import { BUS_GLASS, BusRideScene, TAXI_GLASS, TaxiRideScene } from './TransportScenes'
import { MetroRideScene, MetroStationScene } from './MetroScenes'
import OutdoorScene from './OutdoorScene'

const SceneSwitch = memo(function SceneSwitch({ locId, taxi }: { locId: LocationId; taxi: boolean }) {
  const kind = LOCATIONS[locId].kind
  switch (kind) {
    case 'metro-station': return <MetroStationScene />
    case 'metro-ride': return <MetroRideScene />
    case 'cafe': return <CafeScene locId={locId} />
    case 'bus': return taxi ? <TaxiRideScene /> : <BusRideScene />
    case 'office': return <OfficeScene />
    case 'home': return <HomeScene />
    default: return <OutdoorScene locId={locId} />
  }
})

/** Стёкла интерьеров (координаты сцены 1600×900): по ним стекают капли дождя. */
const GLASS: Partial<Record<LocationId, GlassRect[]>> = {
  cafe: CAFE_GLASS,
  shop: CAFE_GLASS,
  office: [{ x: 40, y: 70, w: 980, h: 560 }],
  home: [{ x: 980, y: 110, w: 440, h: 400 }],
}

/** Полноэкранная сцена: арт + освещение + погода. Локация меняется «под занавесом». */
export function SceneStage() {
  const location = useWorldStore((s) => s.location)
  const lowPerf = useWorldStore((s) => s.lowPerf)
  // такси симуляция показывает в локации bus-ride (states.ts: 'taxi-ride' → 'bus-ride') — у него свой салон
  const taxi = useWorldStore((s) => s.location === 'bus-ride' && s.event?.mode === 'taxi')
  const root = useRef<HTMLDivElement>(null)
  useLightingVars(root)

  // мягкий параллакс от курсора/наклона
  useEffect(() => {
    const el = root.current
    if (!el) return
    const onMove = (e: PointerEvent) => {
      el.style.setProperty('--px', (-(e.clientX / window.innerWidth - 0.5) * 2).toFixed(3))
      el.style.setProperty('--py', (-(e.clientY / window.innerHeight - 0.5) * 2).toFixed(3))
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // индикатор «в помещении» → слабее тонировка, окна вместо осадков
  const outdoor = LOCATIONS[location].outdoor || location === 'bus-stop'
  const showWeather = outdoor ? 'outdoor' : ['cafe', 'shop', 'office', 'home', 'bus-ride'].includes(location) ? 'window' : null

  return (
    <div ref={root} className={`scene-root absolute inset-0 overflow-hidden bg-[#120e24] ${lowPerf ? 'low-perf' : ''}`} data-location={location} data-testid="scene">
      <SceneSwitch key={`${location}${taxi ? '-taxi' : ''}`} locId={location} taxi={taxi} />
      {showWeather && <WeatherRenderer mode={showWeather} glass={location === 'bus-ride' ? (taxi ? TAXI_GLASS : BUS_GLASS) : GLASS[location]} />}
      {/* кинематографичная виньетка + зерно плёнки */}
      <div className="vignette pointer-events-none absolute inset-0" data-testid="vignette" />
      <div className="film-grain pointer-events-none absolute -inset-[10%]" data-testid="grain" />
    </div>
  )
}
