import { LOCATIONS, distanceKm } from '../../data/locations'
import { buildingNode, nodeArea, parseBuilding, placeNode, type NodeId } from '../../data/cityGraph'
import type { CharacterPose, EventKind, LocationId, ScenarioEvent, ScenarioMode, WeatherKind } from '../../types'
import { pick, weightedPick } from '../../utils/math'
import { makeId, planTravelFromNode } from '../engine/LocationTransitionManager'
import { ACTIVITY_SOUNDS, ACTIVITY_STATE, PHASES } from '../travel/states'
import { ACTIVITIES, ALL_OUTDOOR, inWindow, type Activity } from './activities'

export interface RoutineContext {
  /** игровое время, минуты (можно > 1440 — берётся по модулю суток) */
  minutes: number
  mode: ScenarioMode
  weather: WeatherKind
  /** уличный якорь, где сейчас персонаж */
  anchor: LocationId
  /** последнее основное занятие */
  lastKind: EventKind | null
  /** сколько подряд было одинаковых занятий */
  streak?: number
  /** узел графа, где сейчас персонаж (по умолчанию place:anchor) */
  node?: NodeId
}

/** Что и где делать (цель визита). */
export interface VisitTarget {
  kind: EventKind
  /** сцена занятия: уличное место или помещение (cafe, office, home, shop) */
  scene: LocationId
  /** уличное место, к которому относится сцена */
  anchor: LocationId
  duration: number
  pose: CharacterPose
  caption: string
  props?: string[]
  /** для сна: проснуться в этот час (перемотка ночи через clockRate) */
  wakeAt?: number
}

/** Старт сценариев (игровые минуты). */
export const START_MINUTES: Record<ScenarioMode, number> = {
  random: 16.5 * 60,
  free: 15 * 60,
  work: 7.5 * 60,
  rainy: 14 * 60,
  winter: 14.5 * 60,
  night: 22 * 60,
}

const hourOf = (minutes: number) => (((minutes / 60) % 24) + 24) % 24

const outdoorPenalty = (weather: WeatherKind, mode: ScenarioMode): number => {
  switch (weather) {
    case 'thunderstorm':
      return 0.12
    case 'heavy-rain':
      return 0.2
    case 'light-rain':
      return mode === 'rainy' ? 0.7 : 0.55
    case 'heavy-snow':
      return mode === 'winter' ? 1.3 : 0.4
    case 'snow':
      return mode === 'winter' ? 1.5 : 0.8
    case 'fog':
      return 0.8
    default:
      return 1
  }
}

const NIGHT_WAKE_CAPTIONS = ['Просыпается к вечеру — впереди ночная Москва', 'Вечер. Кофе, куртка — и в ночной город']

const ENTER_CAPTION: Partial<Record<LocationId, string>> = {
  cafe: 'Идёт к кофейне и открывает дверь',
  shop: 'Заходит в маленький магазин',
  office: 'Проходит турникет бизнес-центра',
  home: 'Заходит в подъезд и поднимается домой',
}

const EXIT_CAPTION: Partial<Record<LocationId, string>> = {
  cafe: 'Выходит из кофейни',
  shop: 'Выходит из магазина',
  office: 'Выходит из бизнес-центра',
  home: 'Выходит из подъезда во двор',
}

/**
 * Генерирует следующий «стоп» дня и цепочку переходов к нему.
 * Инкрементальный: следующий шаг выбирается по времени суток, погоде,
 * режиму сценария и предыдущему занятию. Все случайности — через rng.
 */
export class DailyRoutineGenerator {
  constructor(private rng: () => number = Math.random) {}

  /** выбрать занятие */
  chooseActivity(ctx: RoutineContext): Activity {
    const hour = hourOf(ctx.minutes)
    const find = (kind: EventKind) => ACTIVITIES.find((a) => a.kind === kind)!
    // после сна — всегда пробуждение (сон заканчивается к нужному часу)
    if (ctx.lastKind === 'sleep') return find('wake')
    // «Ночная Москва»: днём персонаж отсыпается дома
    if (ctx.mode === 'night' && hour >= 5.5 && hour < 20.5) return find('sleep')

    const pen = outdoorPenalty(ctx.weather, ctx.mode)
    const streak = ctx.streak ?? 0
    const allowed = (a: Activity) => {
      if (a.kind === 'wake') return false
      if (ctx.mode === 'night' && (a.kind === 'work' || a.kind === 'lunch')) return false
      // без повторов подряд (рабочий блок можно продлить)
      if (a.kind === ctx.lastKind && !(a.kind === 'work' && streak < 2)) return false
      if (a.kind === 'lunch' && ctx.lastKind === 'cafe') return false
      if (a.kind === 'cafe' && ctx.lastKind === 'lunch') return false
      return true
    }
    let pool = ACTIVITIES.filter((a) => allowed(a) && inWindow(hour, a.win))
    if (!pool.length) pool = ACTIVITIES.filter(allowed)
    const weighted = pool.map((a) => {
      let weight = a.weights[ctx.mode]
      // «Ночная Москва»: под утро персонаж едет спать
      if (ctx.mode === 'night' && a.kind === 'sleep') weight = hour >= 3.5 && hour < 5.5 ? 3 : 0
      if (a.outdoor) weight *= pen
      if (a.kind === 'work' && streak >= 1) weight *= 0.5
      // ночью на ногах только в режиме night
      if ((hour >= 23.5 || hour < 5.5) && ctx.mode !== 'night' && a.kind !== 'sleep') weight *= 0.05
      return { item: a, w: weight }
    })
    const positive = weighted.filter((x) => x.w > 0)
    // если всё «запрещено» весами — просто гуляем (это всегда допустимо, кроме повтора)
    if (!positive.length) return find(ctx.lastKind === 'stroll' ? 'evening-walk' : 'stroll')
    return weightedPick(positive, this.rng)
  }

  private chooseAnchor(act: Activity, ctx: RoutineContext): LocationId {
    if (act.anchors.length === 1) return act.anchors[0]
    return weightedPick(
      act.anchors.map((id) => {
        const d = distanceKm(ctx.anchor, id)
        // чем ближе — тем вероятнее, но весь город остаётся доступным
        return { item: id, w: (id === ctx.anchor ? 0.5 : 1) / (0.7 + d / 3) }
      }),
      this.rng,
    )
  }

  private fillCaption(c: string, anchor: LocationId) {
    return c.replace('{place}', LOCATIONS[anchor].name)
  }

  /** Следующие события: выход из здания → поездка → вход → само занятие. */
  next(ctx: RoutineContext): ScenarioEvent[] {
    const act = this.chooseActivity(ctx)
    const anchor = this.chooseAnchor(act, ctx)
    const scene = act.scene === 'anchor' ? anchor : act.scene
    const duration = Math.round(act.dur[0] + this.rng() * (act.dur[1] - act.dur[0]))
    let caption = this.fillCaption(pick(act.captions, this.rng), anchor)
    if (act.kind === 'wake' && ctx.mode === 'night') caption = pick(NIGHT_WAKE_CAPTIONS, this.rng)
    const wakeAt = act.kind === 'sleep' ? (ctx.mode === 'night' ? 20.75 : 6.25 + this.rng() * 0.75) : undefined
    return this.planVisit(ctx, {
      kind: act.kind,
      scene,
      anchor,
      duration,
      pose: act.pose,
      caption,
      props: act.props,
      wakeAt,
    })
  }

  /**
   * Добраться до цели без телепорта и начать занятие.
   * Цепочка всегда непрерывна: event[i].to === event[i+1].from.
   */
  planVisit(ctx: RoutineContext, target: VisitTarget): ScenarioEvent[] {
    const events: ScenarioEvent[] = []
    let node: NodeId = ctx.node ?? placeNode(ctx.anchor)
    let t = ctx.minutes
    const indoor = !LOCATIONS[target.scene].outdoor
    const targetNode = indoor ? buildingNode(target.scene, target.anchor) : placeNode(target.anchor)
    const push = (e: ScenarioEvent) => {
      events.push(e)
      t += e.duration * (e.clockRate ?? 1)
      node = e.to ?? node
    }

    if (node !== targetNode) {
      // выйти из помещения
      const b = parseBuilding(node)
      if (b) push(this.doorEvent('building-exit', b.scene, b.anchor))
      // доехать до уличного места цели
      const dest = placeNode(target.anchor)
      if (node !== dest) {
        for (const e of planTravelFromNode(node, dest, ctx.weather, this.rng, { minutes: t, scenario: ctx.mode }))
          push(e)
      }
      if (indoor) push(this.doorEvent('building-enter', target.scene, target.anchor))
    }

    const main: ScenarioEvent = {
      id: makeId(target.kind),
      kind: target.kind,
      location: target.scene,
      anchor: target.anchor,
      duration: target.duration,
      pose: target.pose,
      caption: target.caption,
      props: target.props,
      from: targetNode,
      to: targetNode,
      phase: 'activity',
      travelState: ACTIVITY_STATE[target.kind] ?? 'IDLE',
      sounds: ACTIVITY_SOUNDS[target.kind] ?? [],
      announce: true,
    }
    if (target.wakeAt !== undefined) {
      // перематываем ночь/день до часа пробуждения (минимум 1 мин/с)
      const left = (((target.wakeAt * 60 - t) % 1440) + 1440) % 1440
      main.clockRate = Math.max(1, left / target.duration)
    }
    events.push(main)
    return events
  }

  private doorEvent(phase: 'building-enter' | 'building-exit', scene: LocationId, anchor: LocationId): ScenarioEvent {
    const def = PHASES[phase]
    const bld = buildingNode(scene, anchor)
    const place = placeNode(anchor)
    const enter = phase === 'building-enter'
    return {
      id: makeId(phase),
      kind: def.kind,
      location: anchor,
      anchor,
      duration: enter ? 2 : 1.5,
      pose: 'walk',
      caption:
        (enter ? ENTER_CAPTION[scene] : EXIT_CAPTION[scene]) ??
        (enter ? 'Подходит к двери' : `Выходит на улицу — ${LOCATIONS[anchor].name}`),
      destination: enter ? scene : undefined,
      from: enter ? place : bld,
      to: enter ? bld : place,
      phase,
      travelState: def.state,
      mode: 'walk',
      sounds: def.sounds,
      announce: false,
    }
  }

  /** Стартовое событие сценария (персонаж уже на месте — начало истории). */
  first(mode: ScenarioMode, minutes: number): ScenarioEvent[] {
    const hour = hourOf(minutes)
    const mk = (
      kind: EventKind,
      scene: LocationId,
      anchor: LocationId,
      dur: number,
      pose: ScenarioEvent['pose'],
      caption: string,
    ): ScenarioEvent[] => {
      const node = LOCATIONS[scene].outdoor ? placeNode(anchor) : buildingNode(scene, anchor)
      return [
        {
          id: makeId(kind),
          kind,
          location: scene,
          anchor,
          duration: dur,
          pose,
          caption,
          from: node,
          to: node,
          phase: 'activity',
          travelState: ACTIVITY_STATE[kind] ?? 'IDLE',
          sounds: ACTIVITY_SOUNDS[kind] ?? [],
          announce: true,
        },
      ]
    }
    if (mode === 'work' && hour < 9)
      return mk('wake', 'home', 'courtyard', 15, 'sit', 'Утро в Москве: персонаж просыпается дома')
    if (mode === 'night') return mk('stroll', 'tverskaya', 'tverskaya', 36, 'walk', 'Ночная Москва: пустеющая Тверская')
    if (mode === 'rainy') return mk('cafe', 'cafe', 'khamovniki', 30, 'drink', 'Переждать дождь с кофе в кофейне')
    if (mode === 'winter')
      return mk('bench', 'gorky-park', 'gorky-park', 36, 'sit', 'Зимний Парк Горького: снег и тишина')
    return mk('bench', 'gorky-park', 'gorky-park', 40, 'sit', 'Сидит на лавочке в Парке Горького и слушает город')
  }
}

/** Уличный якорь узла (для RoutineContext.anchor). */
export const anchorOfNode = (node: NodeId): LocationId => nodeArea(node)

export const OUTDOOR_ANCHORS = ALL_OUTDOOR
