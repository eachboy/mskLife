import { Clapperboard, MapPin, Send, X } from 'lucide-react'
import { LOCATIONS } from '../../data/locations'
import { scenarioEngine } from '../../simulation/engine/ScenarioEngine'
import { useMapStore } from '../../stores/mapStore'
import { useWorldStore } from '../../stores/worldStore'
import type { TravelMode } from '../../types'
import { pinFor, type Pt } from './mapGeo'
import { useHeroGeo } from './useHeroGeo'

export const MODE_RU: Record<TravelMode, string> = {
  walk: 'пешком',
  metro: 'метро',
  bus: 'автобус',
  tram: 'трамвай',
  taxi: 'такси',
}

/** Карточка выбранной точки карты: «Перейти в сцену» (наезд камеры) и «Отправить героя сюда» (маршрут). */
export function LocationCard({ id, onDive }: { id: string; onDive: (p: Pt) => void }) {
  const select = useMapStore((s) => s.select)
  const hero = useHeroGeo()
  const location = useWorldStore((s) => s.location)
  const event = useWorldStore((s) => s.event)

  const isHero = id === 'hero'
  const pin = isHero ? undefined : pinFor(id as keyof typeof LOCATIONS)
  if (!isHero && !pin) return null
  const def = pin ? LOCATIONS[pin.id] : null
  const here = isHero || location === id || hero.area === id

  const title = isHero ? 'Герой' : (pin?.name ?? '')
  const sub = isHero
    ? (event?.caption ?? 'Гуляет по городу')
    : `${pin?.district}${def?.nearestMetro ? ` · метро «${def.nearestMetro}»` : ''}`

  return (
    <div
      className="glass pointer-events-auto absolute z-10 w-[min(340px,calc(100vw-24px))] rounded-3xl p-4 max-md:inset-x-3 max-md:bottom-[140px] max-md:w-auto md:left-5 md:top-20"
      role="dialog"
      aria-label={`Карточка: ${title}`}
      data-testid="map-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="flex items-center gap-2 font-display text-base font-medium text-[#fff3e2]"
            data-testid="map-card-title"
          >
            <MapPin size={16} className="shrink-0 text-[#ffb27a]" aria-hidden />
            <span className="truncate">{title}</span>
          </div>
          <div className="mt-1 text-xs leading-snug text-[#fff3e2]/65">{sub}</div>
        </div>
        <button
          type="button"
          onClick={() => select(null)}
          aria-label="Закрыть карточку"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10"
        >
          <X size={16} />
        </button>
      </div>
      {def && <p className="mt-2 text-[13px] leading-snug text-[#fff3e2]/80">{def.blurb}</p>}
      {here && !isHero && (
        <div className="mt-2 inline-block rounded-full bg-[#ff7a7a]/20 px-2.5 py-0.5 text-[11px] text-[#ffb3b3]">
          Герой сейчас здесь
        </div>
      )}

      <div className="mt-3 grid gap-2">
        <button
          type="button"
          disabled={!here}
          onClick={() => onDive(isHero ? hero.getPos({ x: 0, y: 0 }) : (pin as { pos: Pt }).pos)}
          className="flex items-center justify-center gap-2 rounded-2xl bg-[#ffb27a] px-4 py-2.5 text-sm font-semibold text-[#2a1a3a] transition hover:bg-[#ffc79c] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-[#fff3e2]/40"
          data-testid="map-dive"
          title={here ? undefined : 'Сцена показывает место, где сейчас герой. Отправьте героя сюда.'}
        >
          <Clapperboard size={16} aria-hidden /> Перейти в сцену
        </button>
        {!here && (
          <div className="-mt-1 text-center text-[11px] text-[#fff3e2]/50">
            Сцена показывает героя — он сейчас в другом месте
          </div>
        )}
        {!isHero && (
          <button
            type="button"
            disabled={here}
            onClick={() => {
              scenarioEngine.goTo(id as keyof typeof LOCATIONS)
              select(null)
            }}
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-[#fff3e2] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="map-send"
          >
            <Send size={16} aria-hidden /> {here ? 'Герой уже здесь' : 'Отправить героя сюда'}
          </button>
        )}
      </div>
    </div>
  )
}
