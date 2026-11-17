import { Bus, CarTaxiFront, Footprints, TramFront } from 'lucide-react'
import {
  type CSSProperties,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { isPageHidden, onPageVisibility } from '../../utils/pageVisibility'
import { WEATHER_PRESETS } from '../weather/weatherData'
import { useWorldStore } from '../../stores/worldStore'
import { mixHex } from '../../utils/math'
import { getLighting, lightingMonth } from './lighting'
import {
  BUS_MAP_LINES,
  clampN,
  legPath,
  mapLineId,
  MAP_CENTER,
  MAP_PINS,
  METRO_MAP_LINES,
  type MapPin,
  PAN_LIMIT,
  panTo,
  type Pt,
  pinFor,
  RINGS,
  RIVER_POINTS,
  screenToPlaneDelta,
  smoothPath,
  toPathD,
  YAW_DEFAULT,
  YAW_MAX,
  YAW_MIN,
  ZOOM_MAX,
  ZOOM_MIN,
} from './mapGeo'
import { PinArt } from './MapPinArt'
import { type HeroMotion, useHeroGeo } from './useHeroGeo'
import './map25d.css'

// ───────── палитра по времени суток ─────────

/** CSS-переменные карты: цвета земли/воды от времени суток и погоды (lighting.ts), ночью — свет окон и неон. */
function useMapPalette(): CSSProperties {
  // В скрытой вкладке палитра заморожена (ноль ререндеров и записей стилей); при возврате — пересчёт.
  const lastSlot = useRef(0)
  const [, wake] = useState(0)
  useEffect(() => onPageVisibility((hidden) => !hidden && wake((n) => n + 1)), [])
  const slot = useWorldStore((s) => {
    if (!isPageHidden()) lastSlot.current = Math.floor(s.minutes / 6)
    return lastSlot.current
  })
  const kind = useWorldStore((s) => s.weatherKind)
  const season = useWorldStore((s) => s.season)
  return useMemo(() => {
    const L = getLighting(slot * 6, WEATHER_PRESETS[kind].params, season, lightingMonth(season))
    const n = L.night
    const water = mixHex(mixHex('#6aa8d6', '#2b4f86', n), L.skyMid, 0.2)
    const water2 = mixHex(mixHex('#4a82b6', '#1b3166', n), L.skyBottom, 0.16)
    return {
      '--map-night': L.lamps.toFixed(2),
      '--map-ground': mixHex('#d9c9a7', '#262046', n),
      '--map-ground2': mixHex('#cbbb98', '#2e2752', n),
      '--map-park': mixHex('#a3be7f', '#2d4a47', n),
      '--map-road': mixHex('#8d859d', '#4b4569', n),
      '--map-water': water,
      '--map-water2': water2,
      '--map-slab': mixHex('#6a5a85', '#2a2346', n),
      '--map-ink': mixHex('#43385a', '#f0e2ce', n),
      '--map-sky': mixHex(L.skyTop, '#120e24', 0.5),
    } as CSSProperties
  }, [slot, kind, season])
}

// ───────── статичная основа карты ─────────

const NEON = ['#ffd36b', '#ff7ad9', '#7ee0ff', '#a98bff']
const SPOKES = [8, 52, 95, 140, 188, 232, 275, 318].map((deg) => {
  const a = (deg * Math.PI) / 180
  return { x: MAP_CENTER + Math.cos(a) * 470, y: MAP_CENTER + Math.sin(a) * 470 }
})
const RIVER_D = smoothPath(RIVER_POINTS)

const MapArt = memo(function MapArt({ active, radar }: { active: string; radar: boolean }) {
  const activeSet = useMemo(() => new Set(active ? active.split(',') : []), [active])
  const dim = activeSet.size > 0
  const parks = MAP_PINS.filter((p) => p.kind === 'park')
  return (
    <svg className="map25-svg" viewBox="0 0 1000 1000" aria-hidden focusable="false">
      <defs>
        <radialGradient id="mp-ground" cx="50%" cy="50%" r="72%">
          <stop offset="0" style={{ stopColor: 'var(--map-ground)' }} />
          <stop offset="1" style={{ stopColor: 'var(--map-ground2)' }} />
        </radialGradient>
        <linearGradient id="mp-water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--map-water)' }} />
          <stop offset="1" style={{ stopColor: 'var(--map-water2)' }} />
        </linearGradient>
        <radialGradient id="mp-park">
          <stop offset="0" style={{ stopColor: 'var(--map-park)', stopOpacity: 0.95 }} />
          <stop offset="1" style={{ stopColor: 'var(--map-park)', stopOpacity: 0 }} />
        </radialGradient>
        <pattern id="mp-blocks" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect x="2" y="2" width="7" height="6" rx="1" fill="rgba(110,92,130,.09)" />
          <rect x="11" y="3" width="6" height="8" rx="1" fill="rgba(110,92,130,.07)" />
          <rect x="3" y="12" width="8" height="6" rx="1" fill="rgba(110,92,130,.07)" />
        </pattern>
        <path id="mp-river" d={RIVER_D} />
      </defs>

      <rect width="1000" height="1000" rx="64" fill="url(#mp-ground)" />
      <circle cx="500" cy="500" r="486" fill="url(#mp-blocks)" />
      <circle
        cx="500"
        cy="500"
        r="486"
        fill="none"
        stroke="var(--map-road)"
        strokeOpacity=".35"
        strokeWidth="3"
        strokeDasharray="2 8"
      />

      {/* парки */}
      {parks.map((p) => (
        <circle
          key={p.id}
          cx={p.pos.x}
          cy={p.pos.y}
          r={p.id === 'vdnh' ? 46 : p.id === 'neskuchny' ? 38 : 30}
          fill="url(#mp-park)"
        />
      ))}

      {/* радиальные магистрали */}
      {SPOKES.map((s) => (
        <line
          key={`${s.x}${s.y}`}
          x1="500"
          y1="500"
          x2={s.x}
          y2={s.y}
          stroke="var(--map-road)"
          strokeOpacity=".4"
          strokeWidth="5"
          strokeLinecap="round"
        />
      ))}

      {/* Москва-река */}
      <path
        d={RIVER_D}
        fill="none"
        stroke="var(--map-road)"
        strokeOpacity=".35"
        strokeWidth="30"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={RIVER_D}
        fill="none"
        stroke="url(#mp-water)"
        strokeWidth="23"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={RIVER_D}
        fill="none"
        stroke="#fff"
        strokeOpacity=".5"
        strokeWidth="2"
        strokeLinecap="round"
        className="river-flow"
      />
      {!radar && (
        <text className="map-ring-label" style={{ letterSpacing: '.3em' }} dy="-14">
          <textPath href="#mp-river" startOffset="64%">
            Москва-река
          </textPath>
        </text>
      )}

      {/* кольцевые артерии: бульварное, садовое, ТТК, спальный пояс */}
      {RINGS.map((r, i) => (
        <g key={r.id}>
          <circle
            cx="500"
            cy="500"
            r={r.r}
            fill="none"
            stroke="var(--map-road)"
            strokeWidth={r.id === 'garden' ? 11 : r.id === 'boulevard' ? 7 : 9}
            strokeOpacity=".85"
          />
          <circle
            cx="500"
            cy="500"
            r={r.r}
            fill="none"
            stroke="#fff"
            strokeOpacity=".2"
            strokeWidth="1.5"
            strokeDasharray="6 8"
          />
          <circle
            cx="500"
            cy="500"
            r={r.r}
            fill="none"
            stroke={NEON[i]}
            strokeWidth="4"
            className="map-neon"
            style={{ filter: `drop-shadow(0 0 7px ${NEON[i]})` }}
          />
          {!radar && (
            <text className="map-ring-label" x="500" y={500 - r.r - 8} textAnchor="middle">
              {r.name}
            </text>
          )}
        </g>
      ))}

      {/* Кремль — центр карты */}
      <g transform="translate(500 500)">
        <polygon points="-17,-9 17,-11 20,8 -12,11" fill="#b4574a" stroke="#f0d9bd" strokeWidth="2" />
        <rect x="-3" y="-17" width="6" height="9" fill="#d9b78a" />
        <polygon points="-3,-17 0,-24 3,-17" fill="#c23b3b" />
      </g>

      {/* автобусные маршруты */}
      {BUS_MAP_LINES.map((l) => {
        const on = activeSet.has(l.id)
        return (
          <path
            key={l.id}
            d={toPathD(l.points)}
            fill="none"
            stroke={l.color}
            strokeWidth={on ? 4.5 : 2.6}
            strokeDasharray="7 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={dim && !on ? 0.3 : 0.85}
            className={on ? 'line-active' : undefined}
            style={{ '--c': l.color } as CSSProperties}
          />
        )
      })}

      {/* линии метро */}
      {METRO_MAP_LINES.map((l) => {
        const on = activeSet.has(l.id)
        return (
          <g key={l.id} opacity={dim && !on ? 0.35 : 1}>
            <path
              d={toPathD(l.points)}
              fill="none"
              stroke={l.color}
              strokeWidth={on ? 7 : 5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={on ? 'line-active' : undefined}
              style={{ '--c': l.color } as CSSProperties}
            />
            {l.stations.map((s) => (
              <circle
                key={s.id}
                cx={s.pos.x}
                cy={s.pos.y}
                r={on ? 3.8 : 3}
                fill="#fff7ea"
                stroke={l.color}
                strokeWidth="1.8"
              />
            ))}
          </g>
        )
      })}
      {!radar &&
        METRO_MAP_LINES.flatMap((l) => l.stations)
          .filter(
            (s, i, a) =>
              a.findIndex((x) => x.name === s.name && Math.hypot(x.pos.x - s.pos.x, x.pos.y - s.pos.y) < 12) === i,
          )
          .map((s) => (
            <text key={s.id} className="st-label" x={s.pos.x + 5} y={s.pos.y + 2}>
              {s.name}
            </text>
          ))}
    </svg>
  )
})

// ───────── слой маршрута героя и площадок под пинами ─────────

const RouteLayer = memo(function RouteLayer({
  selected,
  target,
  radar,
}: {
  selected: string | null
  target: string | null
  radar: boolean
}) {
  const plan = useWorldStore((s) => s.plan)
  const legs = useMemo(
    () =>
      plan
        .map((l) => ({
          key: `${l.from}>${l.to}>${l.line?.id ?? l.mode}`,
          current: l.current,
          color: l.line?.color ?? (l.mode === 'taxi' ? '#f5c518' : '#ffffff'),
          mode: l.mode,
          points: legPath(l.from, l.to, l.line?.id),
        }))
        .filter((l) => l.points.length > 1),
    [plan],
  )
  return (
    <svg className="map25-svg" viewBox="0 0 1000 1000" aria-hidden focusable="false">
      {MAP_PINS.map((p) => (
        <circle
          key={p.id}
          className="pin-plate"
          cx={p.pos.x}
          cy={p.pos.y}
          r={radar ? 10 : 16}
          data-selected={selected === p.id ? '1' : '0'}
          data-target={target === p.id ? '1' : '0'}
        />
      ))}
      {legs.map((l, i) => {
        const d = toPathD(l.points)
        return (
          <g
            key={`${l.key}-${i}`}
            className={l.current ? undefined : 'route-planned'}
            style={{ '--c': l.color } as CSSProperties}
            data-testid="route-leg"
          >
            <path
              d={d}
              fill="none"
              stroke="#1b1530"
              strokeOpacity=".5"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="route-under"
            />
            <path
              d={d}
              fill="none"
              stroke={l.color}
              strokeWidth={l.current ? 7 : 5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="route-run"
            />
          </g>
        )
      })}
    </svg>
  )
})

// ───────── пины ─────────

const PinBillboard = memo(function PinBillboard({
  pin,
  selected,
  interactive,
  onSelect,
}: {
  pin: MapPin
  selected: boolean
  interactive: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      className="map25-bb"
      style={{ '--px': `${pin.pos.x}px`, '--py': `${pin.pos.y}px` } as CSSProperties}
      data-selected={selected ? '1' : '0'}
      data-testid={`pin-${pin.id}`}
      aria-label={`${pin.name}, ${pin.district}`}
      aria-pressed={selected}
      tabIndex={interactive ? 0 : -1}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(pin.id)
      }}
    >
      <PinArt pin={pin} />
      <span className="pin-label">{pin.short}</span>
    </button>
  )
})

const MOTION_LABEL: Record<HeroMotion, string> = {
  metro: 'едет в метро',
  bus: 'едет на автобусе',
  taxi: 'едет на такси',
  walk: 'идёт пешком',
  stand: 'на месте',
}

function HeroIcon({ motion }: { motion: HeroMotion }) {
  const p = { size: 18, strokeWidth: 2.4, 'aria-hidden': true } as const
  if (motion === 'metro') return <TramFront {...p} />
  if (motion === 'bus') return <Bus {...p} />
  if (motion === 'taxi') return <CarTaxiFront {...p} />
  return <Footprints {...p} />
}

/** Пульсирующий маячок героя; значок меняется по виду движения. */
const HeroLayer = memo(function HeroLayer({
  elRef,
  motion,
  moving,
  interactive,
  selected,
  onSelect,
}: {
  /** transform пишет покадровый цикл CityMap25D (не React) */
  elRef: RefObject<HTMLDivElement | null>
  motion: HeroMotion
  moving: boolean
  interactive: boolean
  selected: boolean
  onSelect: (id: string) => void
}) {
  const hero = { motion, moving }
  return (
    <div ref={elRef} className="map25-hero" data-testid="hero-beacon" data-motion={hero.motion}>
      <span className="hero-ring" />
      <span className="hero-ring r2" />
      <button
        type="button"
        className="map25-bb hero-bb"
        style={{ '--px': '0px', '--py': '0px' } as CSSProperties}
        data-selected={selected ? '1' : '0'}
        aria-label={`Герой: ${MOTION_LABEL[hero.motion]}`}
        tabIndex={interactive ? 0 : -1}
        onClick={(e) => {
          e.stopPropagation()
          onSelect('hero')
        }}
      >
        <span className="hero-core" data-moving={hero.moving ? '1' : '0'}>
          <HeroIcon motion={hero.motion} />
        </span>
      </button>
    </div>
  )
})

// ───────── сама карта ─────────

export interface MapViewHandle {
  zoomBy: (factor: number) => void
  yawBy: (deg: number) => void
  reset: () => void
  /** плавно подвести камеру к точке; slow — медленный «наезд» */
  focus: (p: Pt, zoom?: number, slow?: boolean) => void
  /** текущий масштаб карты */
  getZoom: () => number
}

interface Props {
  variant: 'full' | 'radar'
  selected?: string | null
  onSelect?: (id: string | null) => void
  /** пин, к которому едет герой (подсветка цели) */
  target?: string | null
}

const RADAR_SPAN = 400 // единиц сетки по ширине радара
const RADAR_ZOOM = 1.25

/**
 * 2.5D-карта Москвы: плоскость 1000×1000, наклонённая CSS-3D; камера (pan/zoom/yaw) живёт в
 * CSS-переменных плоскости и меняется без перерисовки React. Пины и герой — билборды.
 */
export const CityMap25D = memo(
  forwardRef<MapViewHandle, Props>(function CityMap25D({ variant, selected = null, onSelect, target = null }, ref) {
    const radar = variant === 'radar'
    const viewport = useRef<HTMLDivElement>(null)
    const plane = useRef<HTMLDivElement>(null)
    const cam = useRef({ zoom: radar ? RADAR_ZOOM : 1, yaw: YAW_DEFAULT, panX: 0, panY: 0, fit: 1 })
    const palette = useMapPalette()
    const lowPerf = useWorldStore((s) => s.lowPerf)
    const plan = useWorldStore((s) => s.plan)
    const hero = useHeroGeo()

    const apply = useCallback(() => {
      const el = plane.current
      if (!el) return
      const c = cam.current
      el.style.setProperty('--map-zoom', c.zoom.toFixed(4))
      el.style.setProperty('--map-yaw', `${c.yaw.toFixed(3)}deg`)
      el.style.setProperty('--map-pan-x', `${c.panX.toFixed(2)}px`)
      el.style.setProperty('--map-pan-y', `${c.panY.toFixed(2)}px`)
      el.style.setProperty('--map-fit', c.fit.toFixed(4))
    }, [])

    const setPan = useCallback(
      (x: number, y: number) => {
        cam.current.panX = clampN(x, -PAN_LIMIT, PAN_LIMIT)
        cam.current.panY = clampN(y, -PAN_LIMIT, PAN_LIMIT)
        apply()
      },
      [apply],
    )

    // «вписать» плоскость в размер контейнера
    useEffect(() => {
      const vp = viewport.current
      if (!vp) return
      const measure = () => {
        const r = vp.getBoundingClientRect()
        cam.current.fit = radar ? r.width / RADAR_SPAN : Math.max(0.2, Math.min(r.width / 1340, r.height / 800))
        apply()
      }
      measure()
      const ro = new ResizeObserver(measure)
      ro.observe(vp)
      return () => ro.disconnect()
    }, [radar, apply])

    // Единственный покадровый цикл карты (B-06/B-26): маячок героя + слежение радара.
    // Позиция берётся из getPos() (по getEventProgress), а не интегрируется — после hidden она сразу верна.
    // Ноль аллокаций объектов в кадре: один Pt; строка пишется только при сдвиге > 0.05 px.
    const heroEl = useRef<HTMLDivElement>(null)
    const getHeroPos = hero.getPos
    useEffect(() => {
      const tmp: Pt = { x: 0, y: 0 }
      let lastX = Number.POSITIVE_INFINITY
      let lastY = Number.POSITIVE_INFINITY
      let raf = 0
      const tick = () => {
        raf = 0
        getHeroPos(tmp)
        if (!(Math.abs(tmp.x - lastX) > 0.05 || Math.abs(tmp.y - lastY) > 0.05)) {
          schedule()
          return
        }
        lastX = tmp.x
        lastY = tmp.y
        const el = heroEl.current
        if (el) el.style.transform = `translate3d(${tmp.x.toFixed(2)}px, ${tmp.y.toFixed(2)}px, 1px)`
        if (radar) {
          cam.current.panX = MAP_CENTER - tmp.x
          cam.current.panY = MAP_CENTER - tmp.y
          apply()
        }
        schedule()
      }
      const schedule = () => {
        if (!raf && !isPageHidden()) raf = requestAnimationFrame(tick)
      }
      const stop = () => {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
      }
      const off = onPageVisibility((hidden) => {
        if (hidden) stop()
        else schedule()
      })
      tick() // сразу: маячок не мигает в (0,0) до первого кадра
      return () => {
        off()
        stop()
      }
    }, [getHeroPos, radar, apply])

    const diveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => void (diveTimer.current && clearTimeout(diveTimer.current)), [])

    useImperativeHandle(
      ref,
      () => ({
        zoomBy: (f) => {
          cam.current.zoom = clampN(cam.current.zoom * f, ZOOM_MIN, ZOOM_MAX)
          apply()
        },
        yawBy: (d) => {
          cam.current.yaw = clampN(cam.current.yaw + d, YAW_MIN, YAW_MAX)
          apply()
        },
        reset: () => {
          cam.current.zoom = 1
          cam.current.yaw = YAW_DEFAULT
          cam.current.panX = 0
          cam.current.panY = 0
          apply()
        },
        focus: (p, zoom, slow) => {
          const el = plane.current
          if (slow && el) {
            el.dataset.dive = '1'
            if (diveTimer.current) clearTimeout(diveTimer.current)
            diveTimer.current = setTimeout(() => delete el.dataset.dive, 1400)
          }
          const t = panTo(p)
          if (zoom) cam.current.zoom = slow ? zoom : clampN(zoom, ZOOM_MIN, ZOOM_MAX)
          cam.current.panX = t.x
          cam.current.panY = t.y
          apply()
        },
        getZoom: () => cam.current.zoom,
      }),
      [apply],
    )

    // ─ управление: перетаскивание, колесо, щипок, поворот (Shift/ПКМ), клавиатура ─
    const ptrs = useRef(new Map<number, Pt>())
    const gesture = useRef({
      mode: null as null | 'pan' | 'rot' | 'pinch',
      sx: 0,
      sy: 0,
      lx: 0,
      ly: 0,
      moved: false,
      d0: 0,
      z0: 1,
    })
    const suppressClick = useRef(false)

    const onPointerDown = (e: React.PointerEvent) => {
      if (radar || e.button === 1) return
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const g = gesture.current
      suppressClick.current = false
      if (ptrs.current.size === 2) {
        const [a, b] = [...ptrs.current.values()]
        g.mode = 'pinch'
        g.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1
        g.z0 = cam.current.zoom
        g.moved = true
      } else {
        g.mode = e.button === 2 || e.shiftKey ? 'rot' : 'pan'
        g.sx = g.lx = e.clientX
        g.sy = g.ly = e.clientY
        g.moved = false
      }
    }
    const onPointerMove = (e: React.PointerEvent) => {
      const g = gesture.current
      if (radar || !g.mode || !ptrs.current.has(e.pointerId)) return
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (g.mode === 'pinch') {
        const pts = [...ptrs.current.values()]
        if (pts.length < 2) return
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        cam.current.zoom = clampN(g.z0 * (d / g.d0), ZOOM_MIN, ZOOM_MAX)
        apply()
        return
      }
      if (!g.moved) {
        if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 5) return
        g.moved = true
        suppressClick.current = true
        viewport.current?.setPointerCapture(e.pointerId)
        viewport.current?.setAttribute('data-drag', '1')
        plane.current?.setAttribute('data-drag', '1')
      }
      const dx = e.clientX - g.lx
      const dy = e.clientY - g.ly
      g.lx = e.clientX
      g.ly = e.clientY
      const c = cam.current
      if (g.mode === 'rot') {
        c.yaw = clampN(c.yaw + dx * 0.2, YAW_MIN, YAW_MAX)
        apply()
      } else {
        const d = screenToPlaneDelta(dx, dy, c.yaw, c.zoom * c.fit)
        setPan(c.panX + d.x, c.panY + d.y)
      }
    }
    const endPointer = (e: React.PointerEvent) => {
      ptrs.current.delete(e.pointerId)
      const g = gesture.current
      if (ptrs.current.size === 0) {
        g.mode = null
        viewport.current?.removeAttribute('data-drag')
        plane.current?.removeAttribute('data-drag')
      } else if (ptrs.current.size === 1 && g.mode === 'pinch') {
        const [p] = [...ptrs.current.values()]
        g.mode = 'pan'
        g.lx = g.sx = p.x
        g.ly = g.sy = p.y
      }
    }

    useEffect(() => {
      const vp = viewport.current
      if (!vp || radar) return
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        cam.current.zoom = clampN(cam.current.zoom * Math.exp(-e.deltaY * 0.0014), ZOOM_MIN, ZOOM_MAX)
        apply()
      }
      vp.addEventListener('wheel', onWheel, { passive: false })
      return () => vp.removeEventListener('wheel', onWheel)
    }, [radar, apply])

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (radar || e.target !== e.currentTarget) return
      const c = cam.current
      const step = 60 / c.zoom
      const k = e.key
      if (k === 'ArrowLeft') setPan(c.panX + step, c.panY)
      else if (k === 'ArrowRight') setPan(c.panX - step, c.panY)
      else if (k === 'ArrowUp') setPan(c.panX, c.panY + step)
      else if (k === 'ArrowDown') setPan(c.panX, c.panY - step)
      else if (k === '+' || k === '=') c.zoom = clampN(c.zoom * 1.2, ZOOM_MIN, ZOOM_MAX)
      else if (k === '-') c.zoom = clampN(c.zoom / 1.2, ZOOM_MIN, ZOOM_MAX)
      else if (k === '[') c.yaw = clampN(c.yaw - 6, YAW_MIN, YAW_MAX)
      else if (k === ']') c.yaw = clampN(c.yaw + 6, YAW_MIN, YAW_MAX)
      else return
      e.preventDefault()
      apply()
    }

    const select = useCallback((id: string) => onSelect?.(id), [onSelect])
    const activeLines = useMemo(
      () => [...new Set(plan.map((l) => mapLineId(l.line?.id)).filter(Boolean))].sort().join(','),
      [plan],
    )
    const targetPin = target ?? plan.find((l) => l.dest)?.dest ?? null

    return (
      <div
        ref={viewport}
        className={`map25-viewport ${radar ? 'map25-radar' : ''} ${lowPerf ? 'low-perf-map' : ''}`}
        style={palette}
        tabIndex={radar ? -1 : 0}
        role="application"
        aria-label={
          radar ? 'Мини-радар' : 'Карта Москвы. Стрелки — сдвиг, плюс и минус — масштаб, квадратные скобки — поворот'
        }
        data-testid={radar ? 'map-radar-view' : 'city-map-view'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onContextMenu={(e) => !radar && e.preventDefault()}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.stopPropagation()
            e.preventDefault()
            suppressClick.current = false
          }
        }}
        onClick={() => onSelect?.(null)}
        onKeyDown={onKeyDown}
      >
        <div ref={plane} className="map25-plane" data-testid="map-plane">
          <div className="map25-slab s3" />
          <div className="map25-slab s2" />
          <div className="map25-slab s1" />
          <MapArt active={activeLines} radar={radar} />
          <RouteLayer selected={selected} target={targetPin} radar={radar} />
          {MAP_PINS.map((p) => (
            <PinBillboard key={p.id} pin={p} selected={selected === p.id} interactive={!radar} onSelect={select} />
          ))}
          <HeroLayer
            elRef={heroEl}
            motion={hero.motion}
            moving={hero.moving}
            interactive={!radar}
            selected={selected === 'hero'}
            onSelect={select}
          />
        </div>
      </div>
    )
  }),
)

export { pinFor }
