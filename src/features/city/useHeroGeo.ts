import { useMemo } from 'react'
import { nodeArea } from '../../data/cityGraph'
import { getEventProgress } from '../../simulation/time/eventProgress'
import { useWorldStore } from '../../stores/worldStore'
import type { LocationId } from '../../types'
import { MAP_CENTER, legPath, nodeGrid, pinFor, type Pt } from './mapGeo'

export type HeroMotion = 'metro' | 'bus' | 'taxi' | 'walk' | 'stand'

/** Маршрут текущего события с накопленными длинностями — для расчёта позиции без аллокаций. */
export interface HeroRoute {
  pts: Pt[]
  /** cum[i] — длина пути от pts[0] до pts[i]; cum[0] = 0 */
  cum: number[]
  total: number
}

const EMPTY_ROUTE: HeroRoute = { pts: [], cum: [], total: 0 }

function buildRoute(pts: Pt[]): HeroRoute {
  if (pts.length < 2) return EMPTY_ROUTE
  const cum = new Array<number>(pts.length)
  cum[0] = 0
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  }
  return { pts, cum, total: cum[pts.length - 1] }
}

/**
 * Позиция вдоль маршрута при доле progress (0..1) → в out. Без аллокаций.
 * Для пустого маршрута out не меняется и возвращается false.
 */
export function routePointInto(route: HeroRoute, progress: number, out: Pt): boolean {
  const { pts, cum, total } = route
  if (pts.length < 2 || total < 1e-6) return false
  const target = Math.min(1, Math.max(0, progress)) * total
  let i = 1
  while (i < pts.length - 1 && cum[i] < target) i++
  const seg = cum[i] - cum[i - 1]
  const t = seg < 1e-9 ? 0 : Math.min(1, Math.max(0, (target - cum[i - 1]) / seg))
  out.x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t
  out.y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t
  return true
}

export interface HeroGeo {
  /**
   * Статичная точка: конец события (или узел/пин, если героя не ведёт маршрут). НЕ живая позиция —
   * она меняется только со сменой события. Живую позицию даёт getPos.
   */
  pos: Pt
  motion: HeroMotion
  /** ближайшее уличное место (какой пин «рядом») */
  area: LocationId
  /** идёт ли движение между узлами прямо сейчас */
  moving: boolean
  /** геометрия маршрута текущего события (пустая, если героя ничего не ведёт) */
  route: HeroRoute
  /** ключ события (меняется со сменой события) — для сброса кэшей/transform у потребителя */
  eventKey: string
  /** живая позиция героя → out (без аллокаций, читает getEventProgress(); вызывать из animationClock/обработчиков) */
  getPos: (out: Pt) => Pt
}

/**
 * Где герой на карте. Подписка только на то, что меняется со сменой события; прогресс внутри события
 * в React НЕ читается (getEventProgress() живёт вне React).
 */
export function useHeroGeo(): HeroGeo {
  const event = useWorldStore((s) => s.event)
  const node = useWorldStore((s) => s.node)
  const location = useWorldStore((s) => s.location)
  const state = useWorldStore((s) => s.travelState)

  const route = useMemo(
    () =>
      event?.from && event.to && event.from !== event.to
        ? buildRoute(legPath(event.from, event.to, event.line?.id))
        : EMPTY_ROUTE,
    [event],
  )
  const area = useMemo(() => (node ? nodeArea(node) : (event?.anchor ?? location)), [node, event, location])

  const rest: Pt = useMemo(
    () =>
      (route.pts.length > 1 ? route.pts[route.pts.length - 1] : null) ??
      (event?.to ? nodeGrid(event.to) : null) ??
      (node ? nodeGrid(node) : null) ??
      pinFor(location)?.pos ??
      pinFor(area)?.pos ?? { x: MAP_CENTER, y: MAP_CENTER },
    [route, event, node, location, area],
  )

  const getPos = useMemo(
    () =>
      (out: Pt): Pt => {
        if (!routePointInto(route, getEventProgress(), out)) {
          out.x = rest.x
          out.y = rest.y
        }
        return out
      },
    [route, rest],
  )

  const motion: HeroMotion =
    state === 'RIDING_METRO'
      ? 'metro'
      : state === 'RIDING_BUS'
        ? 'bus'
        : state === 'RIDING_TAXI'
          ? 'taxi'
          : state === 'WALKING' && route.pts.length > 1
            ? 'walk'
            : 'stand'
  const eventKey = event ? `${event.from ?? ''}>${event.to ?? ''}:${event.line?.id ?? ''}:${event.duration}` : ''
  return { pos: rest, motion, area, moving: route.pts.length > 1 && motion !== 'stand', route, eventKey, getPos }
}
