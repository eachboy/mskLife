import { motion } from 'framer-motion'
import { ArrowLeft, LocateFixed, Minus, Plus, RotateCcw, RotateCw, Route as RouteIcon } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef } from 'react'
import { IconButton } from '../../components/ui/IconButton'
import { LOCATIONS } from '../../data/locations'
import { getEventProgress } from '../../simulation/time/eventProgress'
import { useMapStore } from '../../stores/mapStore'
import { type PlanLeg, useWorldStore } from '../../stores/worldStore'
import { isPageHidden, onPageVisibility } from '../../utils/pageVisibility'
import { CityMap25D, type MapViewHandle } from './CityMap25D'
import { LocationCard, MODE_RU } from './LocationCard'
import { DIVE_ZOOM, METRO_MAP_LINES, type Pt } from './mapGeo'
import { useHeroGeo } from './useHeroGeo'

/** «пешком → метро «Кольцевая» → пешком» без повторов подряд. */
export function routeSummary(plan: PlanLeg[]): string {
  const parts: string[] = []
  for (const l of plan) {
    // вестибюль, турникет, эскалатор, пересадка — metro без линии: часть поездки, отдельно не называем
    if (l.mode !== 'walk' && l.mode !== 'taxi' && !l.line) continue
    const name = l.mode === 'walk' || !l.line ? MODE_RU[l.mode] : `${MODE_RU[l.mode]} «${l.line.name}»`
    if (parts[parts.length - 1] !== name) parts.push(name)
  }
  return parts.join(' → ')
}

/** «≈ N мин» до конца маршрута: раз в секунду, textContent по ref, в скрытой вкладке не тикает. */
function useLeftMinutesRef(plan: PlanLeg[], duration: number) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const total = plan.reduce((a, l) => a + l.duration, 0)
    const hasCurrent = plan.some((l) => l.current)
    let id: ReturnType<typeof setInterval> | null = null
    const paint = () => {
      const left = Math.max(1, Math.round(total - (hasCurrent ? getEventProgress() * duration : 0)))
      const text = `≈ ${left} мин`
      if (ref.current && ref.current.textContent !== text) ref.current.textContent = text
    }
    const stop = () => {
      if (id !== null) clearInterval(id)
      id = null
    }
    const start = () => {
      stop()
      paint()
      if (!isPageHidden()) id = setInterval(paint, 1000)
    }
    start()
    const off = onPageVisibility((hidden) => (hidden ? stop() : start()))
    return () => {
      stop()
      off()
    }
  }, [plan, duration])
  return ref
}

function RouteChip() {
  const plan = useWorldStore((s) => s.plan)
  const duration = useWorldStore((s) => s.event?.duration ?? 0)
  const leftRef = useLeftMinutesRef(plan, duration)
  if (!plan.length) return null
  const dest = plan.find((l) => l.dest)?.dest
  return (
    <div
      className="glass pointer-events-none max-w-[min(560px,calc(100vw-24px))] rounded-2xl px-4 py-2 text-xs text-[#fff3e2]"
      data-testid="map-route-chip"
    >
      <div className="flex items-center gap-2 font-semibold">
        <RouteIcon size={14} className="shrink-0 text-[#7ee0ff]" aria-hidden />
        <span className="truncate">{dest ? `Маршрут до «${LOCATIONS[dest].name}»` : 'Герой в пути'}</span>
        <span ref={leftRef} className="ml-auto shrink-0 tabular-nums text-[#ffd6b0]" />
      </div>
      <div className="mt-0.5 truncate text-[#fff3e2]/65">{routeSummary(plan)}</div>
    </div>
  )
}

/** Полноэкранная 2.5D-карта города: пины локаций, маршрут героя, карточка и «наезд» в сцену. */
export function CityMapHub() {
  const selected = useMapStore((s) => s.selected)
  const diving = useMapStore((s) => s.diving)
  const select = useMapStore((s) => s.select)
  const closeMap = useMapStore((s) => s.closeMap)
  const view = useRef<MapViewHandle>(null)
  const hero = useHeroGeo()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dive = useCallback((p: Pt) => {
    const st = useMapStore.getState()
    if (st.diving) return
    st.setDiving(true)
    view.current?.focus(p, DIVE_ZOOM, true)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    timer.current = setTimeout(() => useMapStore.getState().endDive(), reduce ? 0 : 800)
  }, [])

  return (
    <motion.div
      className="absolute inset-0 z-20 bg-[radial-gradient(ellipse_at_50%_38%,#34286a_0%,#1a1438_55%,#0e0a20_100%)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.42, ease: 'easeOut' }}
      role="dialog"
      aria-label="Карта Москвы"
      data-testid="city-map"
      data-diving={diving ? '1' : '0'}
    >
      <div className="absolute inset-x-0 top-0 bottom-[132px] md:bottom-[96px]">
        <CityMap25D ref={view} variant="full" selected={selected} onSelect={diving ? undefined : select} />
      </div>

      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-3 md:left-5 md:top-5">
        <button
          type="button"
          onClick={closeMap}
          disabled={diving}
          className="glass pointer-events-auto flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-[#fff3e2] transition hover:bg-white/10"
          data-testid="map-back"
        >
          <ArrowLeft size={16} aria-hidden /> Вернуться в сцену
        </button>
        <h2 className="hidden font-display text-xs uppercase tracking-[0.3em] text-[#ffd6b0] sm:block">Карта Москвы</h2>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-[68px] -translate-x-1/2 md:top-5 md:left-[60%]">
        <RouteChip />
      </div>

      {/* камера */}
      <div
        className="glass pointer-events-auto absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-0.5 rounded-3xl p-1.5 max-md:top-[120px] max-md:translate-y-0 md:right-5"
        role="toolbar"
        aria-label="Камера карты"
      >
        <IconButton label="Приблизить" onClick={() => view.current?.zoomBy(1.25)} data-testid="map-zoom-in">
          <Plus size={18} />
        </IconButton>
        <IconButton label="Отдалить" onClick={() => view.current?.zoomBy(0.8)} data-testid="map-zoom-out">
          <Minus size={18} />
        </IconButton>
        <IconButton label="Повернуть влево" onClick={() => view.current?.yawBy(-8)}>
          <RotateCcw size={18} />
        </IconButton>
        <IconButton label="Повернуть вправо" onClick={() => view.current?.yawBy(8)}>
          <RotateCw size={18} />
        </IconButton>
        <IconButton label="К герою" onClick={() => view.current?.focus(hero.getPos({ x: 0, y: 0 }), 1.5)} data-testid="map-locate">
          <LocateFixed size={18} />
        </IconButton>
        <IconButton label="Сбросить вид" onClick={() => view.current?.reset()}>
          <span className="text-[11px] font-bold">1:1</span>
        </IconButton>
      </div>

      {/* легенда линий */}
      <div
        className="glass pointer-events-none absolute bottom-[142px] left-5 hidden rounded-2xl px-3 py-2 text-[11px] text-[#fff3e2]/85 lg:block md:bottom-[108px]"
        aria-hidden
      >
        <div className="mb-1 uppercase tracking-widest text-[#fff3e2]/45">Метро</div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {METRO_MAP_LINES.map((l) => (
            <li key={l.id} className="flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-4 rounded-full"
                style={{ background: l.color, boxShadow: `0 0 6px ${l.color}` }}
              />
              {l.id}
            </li>
          ))}
        </ul>
      </div>

      {selected && !diving && <LocationCard id={selected} onDive={dive} />}
      <p className="sr-only" aria-live="polite">
        {selected === 'hero'
          ? 'Выбран герой'
          : selected
            ? `Выбрано: ${LOCATIONS[selected as keyof typeof LOCATIONS]?.name ?? ''}`
            : ''}
      </p>
    </motion.div>
  )
}
