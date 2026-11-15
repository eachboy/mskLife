import { memo, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import Person, { HERO, randomPalette, type PersonPalette, type PersonPose } from '../../scenes/art/Person'
import Vehicle, { type VehicleKind } from '../../scenes/art/Vehicles'
import { useWorldStore } from '../../stores/worldStore'
import { deriveLook } from '../../simulation/engine/CharacterStateManager'
import { eventBus } from '../../utils/eventBus'
import { mulberry32, pick } from '../../utils/math'

export interface Lane {
  y: number
  s: number
  /** направление движения; для пешеходов — случайное, если не задано */
  dir?: 1 | -1
}

export interface EntityConfig {
  /** 0..1: интенсивность людей / транспорта */
  pedestrians: number
  traffic: number
  pedLanes: Lane[]
  vehLanes: Lane[]
  /** допустимые виды транспорта */
  vehicles: VehicleKind[]
  /** пеший ли это парк (велосипеды/самокаты, пары) */
  park?: boolean
  /** ключ локации — для пересоздания слоя */
  id: string
}

interface Ent {
  id: number
  type: 'ped' | 'pair' | 'veh'
  x0: number
  x1: number
  y: number
  s: number
  dur: number
  delay: number
  pal: PersonPalette
  pal2?: PersonPalette
  pose: PersonPose
  veh?: VehicleKind
  color?: string
  facing: 1 | -1
  umbrella: boolean
  coat: 'light' | 'jacket' | 'winter'
  scarf: boolean
  hat: boolean
  cup: boolean
  bag: 'none' | 'backpack' | 'tote' | 'cross'
  head: boolean
}

const CAR_COLORS = ['#5a7ab8', '#a84a4a', '#e2dccf', '#3c3c48', '#6a9a7a', '#b8923a', '#6e5a98', '#8a8f9a', '#26262e']
/** Жёсткий предел живых сущностей на сцену (страховка от накопления). */
const MAX_LIVE = 22
let uid = 0

/** Живая сущность: когда родилась (для расчёта текущей позиции без чтения DOM). */
type LiveEnt = Ent & { born: number; speed: number }

/** Текущая x-позиция сущности по времени (CSS-анимация линейна). */
function curX(e: LiveEnt, now: number) {
  const t = (now - e.born) / 1000 - e.delay
  const k = Math.min(1, Math.max(0, t / e.dur))
  return e.x0 + (e.x1 - e.x0) * k
}
const finished = (e: LiveEnt, now: number) => (now - e.born) / 1000 > e.dur + e.delay + 0.5

/** Сколько места по x занимает сущность (с запасом), чтобы фигуры не налезали друг на друга. */
const gapOf = (e: { type: Ent['type']; veh?: VehicleKind }) =>
  e.type === 'veh' ? (e.veh === 'bus' || e.veh === 'tram' ? 520 : e.veh === 'bike' || e.veh === 'scooter' ? 150 : 330) : e.type === 'pair' ? 200 : 110

/** Встречные пешеходы идут «по своей стороне» (±5 по y) — z-порядок по y остаётся честным. */
const laneY = (lane: Lane, facing: 1 | -1, kind: 'ped' | 'veh') => (kind === 'ped' && lane.dir === undefined ? lane.y + (facing === 1 ? -5 : 5) : lane.y)

/** Идущий герой для проверки пересечений: в его полосе прохожие идут в ту же сторону и не налезают на него. */
export interface HeroLane { x0: number; x1: number; y: number; dur: number; key: number }

function makeEnt(cfg: EntityConfig, kind: 'ped' | 'veh', prefill: boolean, liveEnts: LiveEnt[], hero: LiveEnt | null): LiveEnt | null {
  const s = useWorldStore.getState()
  const rng = Math.random
  const look = deriveLook(s.season, s.temperature, s.weatherKind, true)
  const now = performance.now()
  const live: LiveEnt[] = hero && kind === 'ped' ? [hero, ...liveEnts] : liveEnts
  const lanes = kind === 'veh' ? cfg.vehLanes : cfg.pedLanes
  if (!lanes.length || (kind === 'veh' && !cfg.vehicles.length)) return null

  // несколько попыток найти полосу/позицию без пересечений
  for (let attempt = 0; attempt < 8; attempt++) {
    const lane = pick(lanes)
    const heroLane = !!hero && kind === 'ped' && Math.abs(lane.y - hero.y) < 30
    const facing: 1 | -1 = heroLane ? hero!.facing : lane.dir ?? (rng() < 0.5 ? 1 : -1)
    const y = laneY(lane, facing, kind)
    const veh = kind === 'veh' ? pick(cfg.vehicles) : undefined
    const pair = kind === 'ped' && (cfg.park || rng() < 0.3) && rng() < 0.35
    const type: Ent['type'] = kind === 'veh' ? 'veh' : pair ? 'pair' : 'ped'
    const gap = gapOf({ type, veh })
    const x0 = kind === 'veh' ? (facing === 1 ? -320 : 1920) : facing === 1 ? -120 : 1720
    const x1 = kind === 'veh' ? (facing === 1 ? 1920 : -320) : facing === 1 ? 1720 : -120
    const len = Math.abs(x1 - x0)
    let speed = kind === 'veh'
      ? (veh === 'bike' ? 90 : veh === 'scooter' ? 80 : veh === 'tram' ? 120 : 150 + rng() * 70) * (1 - s.weather.snow * 0.3)
      : 30 + rng() * 30
    const progress = prefill ? 0.05 + rng() * 0.9 : 0
    const x = x0 + (x1 - x0) * progress
    const same = live.filter((o) => Math.abs(o.y - y) < 12 && o.facing === facing && (o.type === 'veh') === (kind === 'veh'))
    // занято ли место: соседи по полосе и по соседним полосам (|dy| < 30), с учётом ширины обоих
    const near = live.filter((o) => Math.abs(o.y - y) < 30 && (o.type === 'veh') === (kind === 'veh'))
    if (near.some((o) => Math.abs(curX(o, now) - x) < Math.max(gap, gapOf(o)))) continue
    // без обгонов: при предзаполнении — скорость соседей по полосе; иначе не быстрее тех, кто впереди
    const ahead = same.filter((o) => (curX(o, now) - x) * facing > 0)
    if (prefill && same.length) speed = same[0].speed
    else if (ahead.length) speed = Math.min(speed, ...ahead.map((o) => o.speed))
    const dur = len / speed
    const delay = -dur * progress

    if (kind === 'veh') {
      if (!prefill && Math.random() < 0.6) eventBus.emit('vehicle-pass', { kind: veh === 'taxi' ? 'taxi' : veh === 'bus' ? 'bus' : veh === 'tram' ? 'tram' : veh === 'bike' || veh === 'scooter' ? 'bike' : 'car' })
      return {
        id: ++uid, type: 'veh', x0, x1, y, s: lane.s, dur, delay, born: now, speed,
        pal: randomPalette(rng), pose: 'stand', veh, color: pick(CAR_COLORS), facing,
        umbrella: false, coat: 'light', scarf: false, hat: false, cup: false, bag: 'none', head: false,
      }
    }
    const rainy = s.weather.rain > 0.25 || s.weather.storm > 0.3
    const pal = randomPalette(rng)
    // походка: пожилые медленнее, молодые быстрее
    if (pal.age === 'elder') speed = Math.min(speed, 30)
    return {
      id: ++uid, type, x0, x1, y, s: lane.s, dur: len / speed, delay: prefill ? -(len / speed) * progress : 0, born: now, speed,
      pal, pal2: pair ? randomPalette(rng) : undefined, pose: 'walk', facing,
      umbrella: rainy && rng() < 0.75, coat: look.coat, scarf: look.scarf && rng() < 0.8, hat: look.hat && rng() < 0.6,
      cup: rng() < 0.18, bag: rng() < 0.3 ? 'backpack' : rng() < 0.3 ? 'tote' : rng() < 0.3 ? 'cross' : 'none', head: rng() < 0.3, veh: undefined,
    }
  }
  return null
}

/** Внешний мини-стор толпы: изменения не перерисовывают сцену, только подписанные полосы. */
export interface Crowd {
  get: () => LiveEnt[]
  subscribe: (fn: () => void) => () => void
}

function createCrowd(): Crowd & { set: (e: LiveEnt[]) => void } {
  let ents: LiveEnt[] = []
  const subs = new Set<() => void>()
  return {
    get: () => ents,
    set: (e) => {
      ents = e
      subs.forEach((f) => f())
    },
    subscribe: (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

/**
 * Фоновая жизнь города: прохожие, пары, транспорт — ОДИН спавнер на сцену.
 * Сущности движутся CSS-анимацией и удаляются по таймеру (плюс страховочная чистка устаревших,
 * лимит MAX_LIVE). Пока вкладка скрыта, новые не спавнятся. Рисуют их полосы <EntityBand>.
 */
export function useCrowd(cfg: EntityConfig, hero?: HeroLane | null): Crowd {
  const crowd = useMemo(() => createCrowd(), [])
  const heroRef = useRef<LiveEnt | null>(null)
  const heroKey = hero ? `${hero.key}:${hero.x0}:${hero.x1}:${hero.y}` : ''
  useEffect(() => {
    if (!hero) {
      heroRef.current = null
      return
    }
    const facing: 1 | -1 = hero.x1 >= hero.x0 ? 1 : -1
    heroRef.current = {
      id: -1, type: 'ped', x0: hero.x0, x1: hero.x1, y: hero.y, s: 1, dur: hero.dur, delay: 0, born: performance.now(),
      speed: Math.abs(hero.x1 - hero.x0) / Math.max(1, hero.dur), pal: HERO, pose: 'walk', facing,
      umbrella: false, coat: 'light', scarf: false, hat: false, cup: false, bag: 'none', head: false,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroKey])
  const lowPerf = useWorldStore((s) => s.lowPerf)

  useEffect(() => {
    let alive = true
    const timers = new Set<ReturnType<typeof setTimeout>>()
    let live: LiveEnt[] = []
    const commit = (next: LiveEnt[]) => {
      live = next
      if (alive) crowd.set(live)
    }
    const prune = () => {
      const now = performance.now()
      if (live.some((e) => finished(e, now))) commit(live.filter((e) => !finished(e, now)))
    }
    const add = (e: LiveEnt | null) => {
      if (!e || !alive) return
      commit([...live.slice(-(MAX_LIVE - 1)), e])
      const life = (e.dur + e.delay) * 1000 + 300
      const t = setTimeout(() => {
        timers.delete(t)
        commit(live.filter((x) => x.id !== e.id))
      }, Math.max(500, life))
      timers.add(t)
    }
    const loop = (kind: 'ped' | 'veh') => {
      if (!alive) return
      const st = useWorldStore.getState()
      const bad = 1 - Math.min(0.75, st.weather.rain * 0.5 + st.weather.snow * 0.3 + st.weather.storm * 0.3)
      const hour = st.minutes / 60
      const quiet = hour > 23.5 || hour < 5 ? 0.35 : 1
      const dens = (kind === 'ped' ? cfg.pedestrians : cfg.traffic) * bad * quiet * (lowPerf ? 0.5 : 1)
      if (dens > 0.02 && !st.paused && !document.hidden) {
        prune()
        add(makeEnt(cfg, kind, false, live, heroRef.current))
      }
      const wait = ((kind === 'ped' ? 5200 : 6200) / Math.max(0.05, dens)) * (0.6 + Math.random() * 0.8)
      const t = setTimeout(() => {
        timers.delete(t)
        loop(kind)
      }, Math.min(wait, 60000))
      timers.add(t)
    }
    // после возврата во вкладку — убрать всё, что успело уйти за кадр
    const onVis = () => {
      if (!document.hidden) prune()
    }
    document.addEventListener('visibilitychange', onVis)
    // стартовое наполнение (с той же проверкой пересечений)
    const initial = Math.round(1 + cfg.pedestrians * 3)
    for (let i = 0; i < initial; i++) add(makeEnt(cfg, 'ped', true, live, heroRef.current))
    const iv = Math.round(cfg.traffic * 2)
    for (let i = 0; i < iv; i++) add(makeEnt(cfg, 'veh', true, live, heroRef.current))
    loop('ped')
    loop('veh')
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
      timers.forEach(clearTimeout)
      timers.clear()
      crowd.set([])
    }
  }, [cfg, lowPerf, crowd])

  return crowd
}

/** Полоса глубины: рисует сущности с yMin ≤ y < yMax, внутри — z-порядок по y. */
export const EntityBand = memo(function EntityBand({ crowd, yMin = -Infinity, yMax = Infinity }: { crowd: Crowd; yMin?: number; yMax?: number }) {
  const ents = useSyncExternalStore(crowd.subscribe, crowd.get)
  const visible = ents.filter((e) => e.y >= yMin && e.y < yMax).sort((a, b) => a.y - b.y)
  return (
    <g>
      {visible.map((e) => (
        <g
          key={e.id}
          className="ent"
          data-testid="entity"
          style={{
            ['--x0' as string]: `${e.x0}px`, ['--x1' as string]: `${e.x1}px`, ['--y' as string]: `${e.y}px`, ['--s' as string]: e.s,
            animationDuration: `${e.dur}s`, animationDelay: `${e.delay}s`,
          }}
        >
          {e.type === 'veh' ? (
            <Vehicle kind={e.veh!} color={e.color} facing={e.facing} riderColor={e.pal.coat} />
          ) : (
            <g>
              <Person
                pose={e.pose} facing={e.facing} palette={e.pal} stride={0.88 + (e.id % 4) * 0.05}
                look={{ umbrella: e.umbrella, coat: e.coat, scarf: e.scarf, hat: e.hat }} cup={e.cup} bag={e.bag} headphones={!!e.pal.phones}
              />
              {e.type === 'pair' && e.pal2 && (
                <g transform={`translate(${-e.facing * 80} 3)`}>
                  <Person pose="walk" facing={e.facing} palette={e.pal2} stride={0.88 + (e.id % 4) * 0.05} look={{ umbrella: e.umbrella, coat: e.coat, scarf: e.scarf, hat: e.hat }} scale={0.95} headphones={!!e.pal2.phones} />
                </g>
              )}
            </g>
          )}
        </g>
      ))}
    </g>
  )
})

export interface SeatedItem { x: number; y: number; s: number; seed: number; flip?: boolean; pose?: PersonPose; seated?: boolean; bag?: 'none' | 'backpack' | 'tote' | 'cross'; headphones?: boolean; view?: 'side' | 'front' }

/** Статичные люди (скамейки, сиденья, стойки). seated — сидит при любой позе рук. */
export function SeatedFolks({ items, outdoor = false }: { items: SeatedItem[]; outdoor?: boolean }) {
  const season = useWorldStore((s) => s.season)
  const temperature = useWorldStore((s) => s.temperature)
  const weatherKind = useWorldStore((s) => s.weatherKind)
  // на улице одеты по погоде (без зонтов — сидят под деревьями), в помещении — по сезону, но без шапок
  const look = outdoor
    ? { ...deriveLook(season, temperature, weatherKind, true), umbrella: false }
    : { ...deriveLook(season, temperature, 'clear', false), umbrella: false, hat: false, breath: false, scarf: false }
  return (
    <g>
      {items.map((it, i) => {
        const pal = randomPalette(mulberry32(it.seed))
        return (
          <g key={i} transform={`translate(${it.x} ${it.y}) scale(${it.flip ? -it.s : it.s} ${it.s})`}>
            <Person pose={it.pose ?? 'sit'} palette={pal} look={look} cup={false} seated={it.seated} view={it.view} bag={it.bag} headphones={it.headphones ?? !!pal.phones} />
          </g>
        )
      })}
    </g>
  )
}
