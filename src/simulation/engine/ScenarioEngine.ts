import { LOCATIONS } from '../../data/locations'
import { nodeArea, placeNode, type NodeId } from '../../data/cityGraph'
import { lightingMonth } from '../../features/city/lighting'
import { weatherManager } from '../../features/weather/WeatherManager'
import { type PlanLeg, useWorldStore, moscowNow, type WorldState } from '../../stores/worldStore'
import type {
  DayPhase,
  EventKind,
  LocationId,
  ScenarioEvent,
  ScenarioMode,
  Season,
  TimeMode,
  TravelState,
} from '../../types'
import { eventBus } from '../../utils/eventBus'
import { mulberry32 } from '../../utils/math'
import { beginEvent, pauseEvent, resumeEvent } from '../time/eventProgress'
import { SimClock, TIME_SCALE, gameMinutes } from '../time/simClock'
import { DailyRoutineGenerator, START_MINUTES } from '../scenarios/DailyRoutineGenerator'
import { dayPhase, moscowMonth } from '../time/moscowTime'
import { TravelStateMachine, canTransition } from '../travel/states'
import { EventManager } from './EventManager'

function dateSeason(): Season {
  const m = moscowMonth()
  return m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'
}

const FADE_OUT_MS = 650
/** разрыв длиннее — пропущенные события «бесшумные» (REALTIME_TRANSIT_AND_MOVEMENT_SPEC §1.3) */
const CATCH_UP_GAP_MS = 2000
/** страховка от бесконечного цикла при перемотке */
const MAX_CATCH_UP_EVENTS = 2000
const TICK_MS = 250
/** как часто сверять игровые часы с московскими в режиме реальных часов (между сверками — по Date.now) */
const REAL_RESYNC_MS = 60_000
const DAY_MS = 86_400_000

/**
 * Главный «режиссёр»: ведёт игровые часы, проигрывает очередь событий,
 * при необходимости генерирует новые и плавно переключает локации.
 * Персонаж всегда стоит в узле графа города (this.node); смена места — только цепочкой фаз.
 */
export class ScenarioEngine {
  private routine: DailyRoutineGenerator
  private events: EventManager
  private sm = new TravelStateMachine()
  private queue: ScenarioEvent[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private worker: Worker | null = null
  private clock: SimClock
  private timeMode: TimeMode = 'x60'
  /** показание игровых часов, минуты 0..1440 (дробные) */
  private clockMin = 0
  private lastMin = -1
  private dayAcc = 0
  /** игровое время, накопленное за время занавеса (применяется к следующему событию) */
  private pending = 0
  /** событие сменилось внутри текущего advance — записать eventElapsed/прогресс один раз */
  private dirty = false
  private wasPaused = false
  private realBaseMs = 0
  private realBaseMin = 0
  private realDay = -1
  private timeouts = new Set<ReturnType<typeof setTimeout>>()
  private elapsed = 0
  private current: ScenarioEvent | null = null
  private lastKind: EventKind | null = null
  private streak = 0
  private node: NodeId = placeNode('gorky-park')
  private busy = false
  private stepAcc = 0
  private phase: DayPhase | null = null

  constructor(
    private rng: () => number = Math.random,
    private nowMs: () => number = () => Date.now(),
  ) {
    this.routine = new DailyRoutineGenerator(rng)
    // отдельный поток случайности: подписи EventManager не сдвигают сценарий (перемотка = непрерывный прогон)
    this.events = new EventManager(mulberry32(Math.floor(rng() * 4294967296)))
    this.clock = new SimClock(nowMs)
  }

  start(mode: ScenarioMode = useWorldStore.getState().scenarioMode) {
    this.stop()
    this.clock.start()
    this.wasPaused = false
    try {
      this.worker = new Worker(new URL('../time/ticker.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = () => this.loop()
    } catch {
      this.worker = null
      this.timer = setInterval(() => this.loop(), TICK_MS)
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisible)
    this.reset(mode, true)
  }

  /** Подготовить стартовую сцену (для экрана приветствия) без запуска часов. */
  prepare(mode: ScenarioMode = useWorldStore.getState().scenarioMode) {
    this.clock.start()
    this.reset(mode, true)
  }

  private onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') this.loop()
  }

  /** Сменить масштаб времени; текущее событие продолжается с того же места. */
  setTimeMode(mode: TimeMode) {
    if (useWorldStore.getState().timeMode !== mode) useWorldStore.getState().patch({ timeMode: mode })
    this.syncScale()
  }

  private syncScale() {
    const mode = useWorldStore.getState().timeMode
    if (mode === this.timeMode && this.clock.scale === TIME_SCALE[mode]) return
    this.timeMode = mode
    this.clock.scale = TIME_SCALE[mode]
    if (this.current) this.restartProgress()
  }

  private restartProgress() {
    if (!this.current) return
    beginEvent(useWorldStore.getState().eventKey, this.current.duration, this.clock.scale, this.elapsed, this.nowMs())
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.worker?.terminate()
    this.worker = null
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible)
    this.timeouts.forEach(clearTimeout)
    this.timeouts.clear()
    this.busy = false
  }

  /** Сменить сценарий (кинематографично). Это начало новой истории: место и время задаёт сценарий. */
  reset(mode: ScenarioMode, initial = false) {
    const s = useWorldStore.getState()
    this.timeouts.forEach(clearTimeout)
    this.timeouts.clear()
    this.busy = false
    this.queue = []
    this.lastKind = null
    this.streak = 0
    this.current = null
    this.pending = 0
    this.elapsed = 0
    this.sm.reset('IDLE')
    this.events.reset()
    this.syncScale()

    const season: Season = mode === 'winter' ? 'winter' : dateSeason()
    const minutes = this.isRealClock(s) ? this.realMin(true) : START_MINUTES[mode]
    this.clockMin = minutes
    this.lastMin = Math.floor(minutes)
    s.patch({ scenarioMode: mode, season, minutes, paused: false, travelState: 'IDLE' })
    if (mode === 'rainy') weatherManager.force('light-rain')
    else if (mode === 'winter') weatherManager.force('snow')
    else if (mode === 'night') weatherManager.force('partly-cloudy')
    else if (!initial) weatherManager.force('partly-cloudy')
    else weatherManager.force('clear')

    this.queue = this.routine.first(mode, minutes)
    this.node = this.queue[0]?.from ?? placeNode('gorky-park')
    this.updateDayPhase(minutes, season)
    this.playNext(initial)
  }

  /**
   * Пользователь выбрал локацию: персонаж добирается туда по графу (без телепорта).
   * Занятие прерывается сразу (персонаж встаёт и идёт). Если он в пути — текущая фаза
   * доигрывается, а из уже запланированной поездки сохраняется минимальный хвост
   * (например, до выхода из вагона), после которого новый маршрут — допустимый переход.
   */
  goTo(loc: LocationId) {
    if (this.busy) {
      this.later(() => this.goTo(loc), FADE_OUT_MS + 20)
      return
    }
    const s = useWorldStore.getState()
    const def = LOCATIONS[loc]
    const anchor: LocationId = def.outdoor
      ? loc
      : def.kind === 'office'
        ? 'moscow-city'
        : loc === 'home'
          ? 'courtyard'
          : nodeArea(this.node)
    const kind: EventKind =
      def.kind === 'park'
        ? 'bench'
        : def.kind === 'office'
          ? 'work'
          : def.kind === 'cafe'
            ? loc === 'shop'
              ? 'shop'
              : 'cafe'
            : def.kind === 'courtyard'
              ? 'courtyard'
              : def.kind === 'home'
                ? 'home-night'
                : 'stroll'
    const poseMap = {
      bench: 'sit',
      work: 'type',
      cafe: 'drink',
      shop: 'stand',
      courtyard: 'sit',
      'home-night': 'read',
      stroll: 'walk',
    } as const
    const target = {
      kind,
      scene: loc,
      anchor,
      duration: 30,
      pose: poseMap[kind as keyof typeof poseMap] ?? 'walk',
      caption: `Отправляется: ${def.name}`,
    }
    const cur = this.current
    const interruptible = !cur || cur.phase === 'activity'
    let t = this.clockMin
    let from = this.node
    let lastState: TravelState = cur?.travelState ?? 'IDLE'
    if (!interruptible && cur) t += Math.max(0, cur.duration - this.elapsed)
    const kept: ScenarioEvent[] = []
    for (let k = 0; ; k++) {
      const plan = this.routine.planVisit(
        {
          minutes: t,
          mode: s.scenarioMode,
          weather: s.weatherKind,
          anchor: nodeArea(from),
          node: from,
          lastKind: this.lastKind,
          streak: this.streak,
        },
        target,
      )
      const first = plan[0]?.travelState ?? lastState
      if (canTransition(lastState, first) || k >= this.queue.length) {
        this.queue = [...kept, ...plan]
        break
      }
      const next = this.queue[k]
      kept.push(next)
      t += next.duration * (next.clockRate ?? 1)
      from = next.to ?? from
      lastState = next.travelState ?? lastState
    }
    if (interruptible) this.nextEvent(false)
    else this.publishPlan()
  }

  /**
   * Цепочка поездки для карты: текущее событие и подряд идущие за ним события поездки из очереди
   * (до первого занятия). Хранится в worldStore.plan.
   */
  private publishPlan() {
    const legs: PlanLeg[] = []
    const add = (ev: ScenarioEvent, current: boolean) => {
      if (!ev.trip || !ev.from || !ev.to || !ev.mode) return false
      legs.push({
        from: ev.from,
        to: ev.to,
        mode: ev.mode,
        line: ev.line,
        dest: ev.trip.to,
        duration: ev.duration,
        current,
      })
      return true
    }
    if (this.current) add(this.current, true)
    for (const ev of this.queue) if (!add(ev, false)) break
    useWorldStore.setState({ plan: legs })
  }

  private isRealClock(s: WorldState): boolean {
    return s.clockMode === 'real' || s.timeMode === 'realtime'
  }

  /** Московские минуты суток: Intl вызывается раз в минуту, между сверками — по стенным часам. */
  private realMin(force: boolean): number {
    const now = this.nowMs()
    if (force || now < this.realBaseMs || now - this.realBaseMs >= REAL_RESYNC_MS) {
      const p = moscowNow(new Date(now))
      const day = Math.floor(Date.UTC(p.parts.year, p.parts.month - 1, p.parts.day) / DAY_MS)
      if (this.realDay !== -1 && day > this.realDay) this.dayAcc += day - this.realDay
      this.realDay = day
      this.realBaseMs = now
      this.realBaseMin = p.minutes
    }
    return (this.realBaseMin + (now - this.realBaseMs) / 60000) % 1440
  }

  /** Один шаг от стенных часов; вызывается воркером, visibilitychange и (в тестах) напрямую. */
  loop() {
    const dMs = this.clock.stepMs()
    const s = useWorldStore.getState()
    if (!s.started || s.paused) {
      if (!this.wasPaused) {
        this.wasPaused = true
        pauseEvent(this.nowMs())
      }
      return
    }
    if (this.wasPaused) {
      this.wasPaused = false
      resumeEvent(this.nowMs())
    }
    const silent = dMs > CATCH_UP_GAP_MS
    if (!silent) {
      const dt = dMs / 1000
      this.events.tick(dt)
      this.footsteps(dt, s)
    }
    this.advance(gameMinutes(dMs, this.clock.scale), silent)
  }

  /** Совместимость: dt — реальные секунды, шаг «как будто» прошло dt секунд. */
  tick(dt: number) {
    this.syncScale()
    const s = useWorldStore.getState()
    this.events.tick(dt)
    this.footsteps(dt, s)
    this.advance(gameMinutes(dt * 1000, this.clock.scale), false)
  }

  private footsteps(dt: number, s: WorldState) {
    if (this.busy || !this.current) return
    if (this.current.pose === 'walk' && LOCATIONS[s.location].outdoor) {
      this.stepAcc += dt
      if (this.stepAcc > 0.55) {
        this.stepAcc = 0
        eventBus.emit('footstep', {
          surface: s.snowCover > 0.3 ? 'snow' : s.location === 'gorky-park' ? 'grass' : 'asphalt',
        })
      }
    }
  }

  private addClock(d: number) {
    this.clockMin += d
    if (this.clockMin >= 1440) {
      const days = Math.floor(this.clockMin / 1440)
      this.clockMin -= days * 1440
      this.dayAcc += days
    }
  }

  /** dGame — игровые минуты «времени событий». silent — идёт перемотка после разрыва. */
  private advance(dGame: number, silent: boolean) {
    this.syncScale()
    const s = useWorldStore.getState()
    const realClock = this.isRealClock(s)
    let left = dGame
    let guard = 0
    if (!this.current) this.addClock(left)
    while (left > 0 && this.current && guard++ < MAX_CATCH_UP_EVENTS) {
      if (this.busy) {
        this.pending += left // занавес: время не теряется, достанется следующему событию
        left = 0
        break
      }
      const rate = realClock ? 1 : (this.current.clockRate ?? 1)
      const remain = this.current.duration - this.elapsed
      if (left < remain) {
        this.elapsed += left
        this.addClock(left * rate)
        left = 0
        break
      }
      left -= remain
      this.addClock(remain * rate)
      this.elapsed = this.current.duration
      if (!this.nextEvent(silent && left > 0)) break
    }
    if (left > 0 && guard >= MAX_CATCH_UP_EVENTS && !this.busy) this.addClock(left)
    this.publishClock(s, realClock, silent)
  }

  /** §1.5: minutes — при смене целой минуты; eventElapsed/прогресс — раз на смену события. */
  private publishClock(s: WorldState, realClock: boolean, resync: boolean) {
    if (realClock) this.clockMin = this.realMin(resync)
    let patch: Partial<WorldState> | null = null
    const fl = Math.floor(this.clockMin)
    if (fl !== this.lastMin) {
      this.lastMin = fl
      patch = { minutes: this.clockMin }
    }
    if (this.dayAcc) {
      patch = patch ?? {}
      patch.dayCount = s.dayCount + this.dayAcc
      this.dayAcc = 0
    }
    if (this.dirty) {
      this.dirty = false
      patch = patch ?? {}
      patch.eventElapsed = this.elapsed
      this.restartProgress()
    }
    if (!patch) return
    s.patch(patch)
    if (patch.minutes !== undefined) this.updateDayPhase(this.clockMin, s.season)
  }

  private updateDayPhase(minutes: number, season: Season) {
    const phase = dayPhase(minutes, lightingMonth(season))
    if (phase === this.phase) return
    const prev = this.phase
    this.phase = phase
    useWorldStore.getState().patch({ dayPhase: phase })
    eventBus.emit('day-phase', { phase, prev })
  }

  /** Следующее событие очереди (при пустой очереди — генерирует). false — события нет. */
  private nextEvent(silent: boolean): boolean {
    if (!this.queue.length) {
      const s = useWorldStore.getState()
      this.queue = this.routine.next({
        minutes: this.clockMin,
        mode: s.scenarioMode,
        weather: s.weatherKind,
        anchor: nodeArea(this.node),
        node: this.node,
        lastKind: this.lastKind,
        streak: this.streak,
      })
    }
    return this.playNext(false, silent)
  }

  private later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timeouts.delete(t)
      fn()
    }, ms)
    this.timeouts.add(t)
  }

  private playNext(instant: boolean, silent = false): boolean {
    const next = this.queue.shift()
    if (!next) return false
    const ev: ScenarioEvent = silent ? { ...next, silent: true } : next
    const s = useWorldStore.getState()
    const apply = () => {
      if (ev.phase === 'activity') {
        this.streak = ev.kind === this.lastKind ? this.streak + 1 : 0
        this.lastKind = ev.kind
      }
      const prevState = this.sm.state
      const state = ev.travelState ?? prevState
      if (!this.sm.transition(state) && import.meta.env?.DEV)
        console.warn('[travel] переход', prevState, '→', state, ev.phase)
      this.current = ev
      this.node = ev.to ?? this.node
      this.elapsed = 0
      this.dirty = true
      useWorldStore.setState((st) => ({
        location: ev.location,
        transitionTo: null,
        event: ev,
        pose: ev.pose,
        eventKey: st.eventKey + 1,
        eventElapsed: 0,
        node: this.node,
        travelState: state,
      }))
      this.restartProgress()
      if (!silent) this.publishPlan()
      if (!silent && ev.announce !== false) useWorldStore.getState().setCaption(ev.caption)
      if (ev.phase) {
        eventBus.emit('travel-state', {
          state,
          prev: prevState,
          phase: ev.phase,
          mode: ev.mode ?? null,
          location: ev.location,
          duration: ev.duration,
          ...(silent ? { silent: true } : null),
        })
        if (!silent)
          for (const cue of ev.sounds ?? [])
            eventBus.emit('travel-sound', { cue, phase: ev.phase, mode: ev.mode ?? null })
      }
      this.busy = false
    }
    if (silent) {
      apply() // перемотка: без занавеса и без звуков перехода
      return true
    }
    if (instant || ev.location === s.location) {
      const from = s.location
      apply()
      if (instant || from !== ev.location)
        eventBus.emit('location-change', { from: instant ? null : from, to: ev.location })
      return true
    }
    // кинематографичный переход: затемнение → смена сцены → проявление
    this.busy = true
    s.patch({ transitionTo: ev.location })
    this.later(() => {
      const from = useWorldStore.getState().location
      apply() // сбрасывает transitionTo → занавес растворяется
      eventBus.emit('location-change', { from, to: ev.location })
      const p = this.pending
      this.pending = 0
      if (p > 0) this.advance(p, false) // время занавеса достаётся новому событию
    }, FADE_OUT_MS)
    return true
  }
}

export const scenarioEngine = new ScenarioEngine()
