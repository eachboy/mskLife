import { LOCATIONS } from '../../data/locations'
import { nodeArea, placeNode, type NodeId } from '../../data/cityGraph'
import { lightingMonth } from '../../features/city/lighting'
import { weatherManager } from '../../features/weather/WeatherManager'
import { useWorldStore, moscowNow } from '../../stores/worldStore'
import type { DayPhase, EventKind, LocationId, ScenarioEvent, ScenarioMode, Season, TravelState } from '../../types'
import { eventBus } from '../../utils/eventBus'
import { DailyRoutineGenerator, START_MINUTES } from '../scenarios/DailyRoutineGenerator'
import { dayPhase, moscowMonth } from '../time/moscowTime'
import { TravelStateMachine, canTransition } from '../travel/states'
import { EventManager } from './EventManager'

function dateSeason(): Season {
  const m = moscowMonth()
  return m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'
}

const FADE_OUT_MS = 650

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
  private timeouts = new Set<ReturnType<typeof setTimeout>>()
  private last = 0
  private elapsed = 0
  private current: ScenarioEvent | null = null
  private lastKind: EventKind | null = null
  private streak = 0
  private node: NodeId = placeNode('gorky-park')
  private busy = false
  private stepAcc = 0
  private phase: DayPhase | null = null

  constructor(private rng: () => number = Math.random) {
    this.routine = new DailyRoutineGenerator(rng)
    this.events = new EventManager(rng)
  }

  start(mode: ScenarioMode = useWorldStore.getState().scenarioMode) {
    this.stop()
    this.last = performance.now()
    this.timer = setInterval(() => this.loop(), 250)
    this.reset(mode, true)
  }

  /** Подготовить стартовую сцену (для экрана приветствия) без запуска часов. */
  prepare(mode: ScenarioMode = useWorldStore.getState().scenarioMode) {
    this.reset(mode, true)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
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
    this.sm.reset('IDLE')
    this.events.reset()

    const season: Season = mode === 'winter' ? 'winter' : dateSeason()
    const minutes = s.clockMode === 'real' ? moscowNow().minutes : START_MINUTES[mode]
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
    let t = s.minutes
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
    if (interruptible) this.advance()
  }

  private loop() {
    const now = performance.now()
    const dt = Math.min(1, (now - this.last) / 1000)
    this.last = now
    const s = useWorldStore.getState()
    if (!s.started || s.paused) return
    this.tick(dt)
  }

  tick(dt: number) {
    const s = useWorldStore.getState()
    this.events.tick(dt)
    // игровые часы
    let minutes: number
    if (s.clockMode === 'real') minutes = moscowNow().minutes
    else {
      const rate = this.current?.clockRate ?? 1
      minutes = s.minutes + dt * rate
    }
    if (minutes >= 1440) {
      minutes -= 1440
      s.patch({ dayCount: s.dayCount + 1 })
    }
    s.patch({ minutes })
    this.updateDayPhase(minutes, s.season)

    if (this.busy || !this.current) return
    this.elapsed += dt
    // шаги для звука
    if (this.current.pose === 'walk' && LOCATIONS[s.location].outdoor) {
      this.stepAcc += dt
      if (this.stepAcc > 0.55) {
        this.stepAcc = 0
        eventBus.emit('footstep', {
          surface: s.snowCover > 0.3 ? 'snow' : s.location === 'gorky-park' ? 'grass' : 'asphalt',
        })
      }
    }
    if (this.elapsed >= this.current.duration) this.advance()
  }

  private updateDayPhase(minutes: number, season: Season) {
    const phase = dayPhase(minutes, lightingMonth(season))
    if (phase === this.phase) return
    const prev = this.phase
    this.phase = phase
    useWorldStore.getState().patch({ dayPhase: phase })
    eventBus.emit('day-phase', { phase, prev })
  }

  private advance() {
    if (!this.queue.length) {
      const s = useWorldStore.getState()
      this.queue = this.routine.next({
        minutes: s.minutes,
        mode: s.scenarioMode,
        weather: s.weatherKind,
        anchor: nodeArea(this.node),
        node: this.node,
        lastKind: this.lastKind,
        streak: this.streak,
      })
    }
    this.playNext(false)
  }

  private later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timeouts.delete(t)
      fn()
    }, ms)
    this.timeouts.add(t)
  }

  private playNext(instant: boolean) {
    const ev = this.queue.shift()
    if (!ev) return
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
      useWorldStore.setState((st) => ({
        location: ev.location,
        transitionTo: null,
        event: ev,
        pose: ev.pose,
        eventKey: st.eventKey + 1,
        node: this.node,
        travelState: state,
      }))
      if (ev.announce !== false) useWorldStore.getState().setCaption(ev.caption)
      if (ev.phase) {
        eventBus.emit('travel-state', {
          state,
          prev: prevState,
          phase: ev.phase,
          mode: ev.mode ?? null,
          location: ev.location,
          duration: ev.duration,
        })
        for (const cue of ev.sounds ?? [])
          eventBus.emit('travel-sound', { cue, phase: ev.phase, mode: ev.mode ?? null })
      }
      this.busy = false
    }
    if (instant || ev.location === s.location) {
      const from = s.location
      apply()
      if (instant || from !== ev.location)
        eventBus.emit('location-change', { from: instant ? null : from, to: ev.location })
      return
    }
    // кинематографичный переход: затемнение → смена сцены → проявление
    this.busy = true
    s.patch({ transitionTo: ev.location })
    this.later(() => {
      const from = useWorldStore.getState().location
      apply() // сбрасывает transitionTo → занавес растворяется
      eventBus.emit('location-change', { from, to: ev.location })
    }, FADE_OUT_MS)
  }
}

export const scenarioEngine = new ScenarioEngine()
