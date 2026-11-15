import { describe, expect, it } from 'vitest'
import type { TravelPhase, TravelSoundCue } from '../../types'
import type { AudioMixer } from './AudioMixer'
import { NoiseBank, NoiseBurst, type ToneModule } from './audioUtils'
import { GatedLayer } from './layerGate'
import { TravelSoundEngine } from './TravelSoundEngine'

/**
 * Фейковый Tone: без Web Audio, но с честным учётом созданных/освобождённых узлов,
 * подключений и значений автоматизации. Часы — как в приложении: now() = currentTime + lookAhead.
 */
function fakeWorld(lookAhead = 0.3) {
  const timers = new Map<number, { at: number; fn: () => void }>()
  let id = 0
  const ctx = {
    currentTime: 0,
    now: () => ctx.currentTime + lookAhead,
    setTimeout: (fn: () => void, sec: number) => {
      timers.set(++id, { at: ctx.now() + sec, fn })
      return id
    },
    clearTimeout: (t: number) => timers.delete(t),
    /** идём по 50 мс (как тикер Tone), срабатывают таймеры */
    advance(sec: number, each?: () => void) {
      const end = ctx.currentTime + sec
      while (ctx.currentTime < end - 1e-9) {
        ctx.currentTime += 0.05
        for (const [k, t] of [...timers]) {
          if (t.at <= ctx.now()) {
            timers.delete(k)
            t.fn()
          }
        }
        each?.()
      }
    },
  }
  const stats = { created: 0, disposed: 0, badValues: 0 }
  const edges = new Set<string>()
  let nodeId = 0
  class Param {
    value = 0
    set(v: number) {
      if (!Number.isFinite(v)) stats.badValues++
      this.value = v
      return this
    }
    setValueAtTime(v: number, t: number) {
      if (!Number.isFinite(t)) stats.badValues++
      return this.set(v)
    }
    linearRampTo(v: number, d: number) {
      if (!(d > 0)) stats.badValues++
      return this.set(v)
    }
    rampTo(v: number) {
      return this.set(v)
    }
    linearRampToValueAtTime(v: number) {
      return this.set(v)
    }
  }
  class Node {
    readonly id = ++nodeId
    context = ctx
    gain = new Param()
    frequency = new Param()
    pan = new Param()
    Q = new Param()
    disposed = false
    constructor() {
      stats.created++
    }
    connect(d: Node) {
      edges.add(`${this.id}>${d.id}`)
      return this
    }
    disconnect(d?: Node) {
      if (d) edges.delete(`${this.id}>${d.id}`)
      else for (const e of [...edges]) if (e.startsWith(`${this.id}>`)) edges.delete(e)
      return this
    }
    chain(...nodes: Node[]) {
      let prev: Node = this
      for (const n of nodes) {
        prev.connect(n)
        prev = n
      }
      return this
    }
    start() {
      return this
    }
    stop() {
      return this
    }
    triggerAttackRelease(_f: number, d: number, t: number) {
      if (!Number.isFinite(d) || !Number.isFinite(t)) stats.badValues++
      return this
    }
    dispose() {
      if (!this.disposed) stats.disposed++
      this.disposed = true
      return this
    }
  }
  const T = { Gain: Node, Filter: Node, Oscillator: Node, Noise: Node, Synth: Node, AmplitudeEnvelope: Node, Panner: Node } as unknown as ToneModule
  const cityIn = new Node()
  const mixer = { context: ctx, cityIn } as unknown as AudioMixer
  const connected = (n: unknown, d: unknown) => edges.has(`${(n as Node).id}>${(d as Node).id}`)
  return { ctx, T, mixer, stats, edges, connected, Node }
}

describe('GatedLayer / OutputGate — отключение только после конца рампы', () => {
  it('с lookAhead 0.3 с слой не отключается раньше, чем рампа к нулю дошла до конца', () => {
    const w = fakeWorld(0.3)
    const g = new w.Node()
    const dest = new w.Node()
    const layer = new GatedLayer(w.ctx, g as never, dest as never)
    layer.set(0.5, 1)
    expect(w.connected(g, dest)).toBe(true)
    w.ctx.advance(2)
    const rampEnd = w.ctx.now() + 0.6 // рампа планируется от now()
    layer.set(0, 0.6)
    let offAt = -1
    w.ctx.advance(3, () => {
      if (offAt < 0 && !w.connected(g, dest)) offAt = w.ctx.currentTime
    })
    expect(offAt).toBeGreaterThan(0)
    expect(offAt).toBeGreaterThanOrEqual(rampEnd)
  })

  it('регресс: повторные set(0) каждые 0.2 с не мешают отключению (раньше слой не отключался никогда)', () => {
    const w = fakeWorld(0.3)
    const g = new w.Node()
    const dest = new w.Node()
    const layer = new GatedLayer(w.ctx, g as never, dest as never)
    layer.set(0.4, 0.6)
    w.ctx.advance(1)
    let k = 0
    w.ctx.advance(4, () => {
      if (++k % 4 === 0) layer.set(0, 0.6)
    })
    expect(layer.active).toBe(false)
    expect(w.connected(g, dest)).toBe(false)
  })

  it('повторное включение во время затухания отменяет отключение', () => {
    const w = fakeWorld(0.3)
    const g = new w.Node()
    const dest = new w.Node()
    const layer = new GatedLayer(w.ctx, g as never, dest as never)
    layer.set(0.4, 0.5)
    layer.set(0, 0.5)
    w.ctx.advance(0.2)
    layer.set(0.3, 0.5)
    w.ctx.advance(3)
    expect(w.connected(g, dest)).toBe(true)
  })
})

describe('NoiseBurst.connectGated — пул ударов подключён только пока звучит', () => {
  it('подключается при ударе и отключается после хвоста', () => {
    const w = fakeWorld(0.3)
    const bank = new NoiseBank(w.T)
    const dest = new w.Node()
    const b = new NoiseBurst(w.T, { release: 0.2, voices: 2 }, bank)
    b.connectGated(dest as never)
    expect(b.connected).toBe(false)
    const t = w.ctx.now() + 0.1
    b.hit(t, 1, 0.05)
    expect(b.connected).toBe(true)
    // до конца хвоста (t + 0.005 + 0.05 + 0.2) — подключён
    w.ctx.advance(0.3)
    expect(b.connected).toBe(true)
    w.ctx.advance(1.5)
    expect(b.connected).toBe(false)
  })
})

const PHASES: Array<[TravelPhase, TravelSoundCue[]]> = [
  ['walk-street', ['footsteps']],
  ['walk-crossing', ['crosswalk-signal']],
  ['building-enter', ['building-door']],
  ['metro-turnstile', ['turnstile']],
  ['metro-escalator-down', ['escalator']],
  ['metro-platform-wait', ['platform-ambience']],
  ['metro-train-arrival', ['train-arrive', 'doors-open']],
  ['metro-boarding', []],
  ['metro-departure', ['doors-close', 'train-depart']],
  ['metro-ride', ['tunnel']],
  ['metro-arriving', ['station-announcement', 'train-brake']],
  ['metro-alighting', ['doors-open']],
  ['bus-arrival', ['bus-arrive', 'bus-doors']],
  ['bus-validate', ['validator-beep']],
  ['bus-ride', ['bus-engine']],
  ['bus-traffic-light', ['bus-brake']],
  ['bus-alighting', ['bus-doors']],
  ['taxi-order', ['phone-tap']],
  ['taxi-boarding', ['car-door']],
  ['taxi-ride', ['car-engine']],
  ['taxi-alighting', ['car-door']],
  ['activity', ['cup', 'keyboard', 'page-turn']],
]

function makeEngine() {
  const w = fakeWorld(0.3)
  const presence: number[] = []
  const e = new TravelSoundEngine(w.T, w.mixer, { onTrainPresence: (p) => presence.push(p) })
  e.init()
  const tick = (sec: number) => {
    let acc = 0
    w.ctx.advance(sec, () => {
      acc += 0.05
      if (acc >= 0.2 - 1e-9) {
        acc = 0
        e.update()
      }
    })
  }
  return { w, e, tick, presence }
}

describe('TravelSoundEngine — жизненный цикл', () => {
  it('100 смен фаз: ни одного нового узла, значения конечны; после тишины все выходы отключены', () => {
    const { w, e, tick } = makeEngine()
    const created = w.stats.created
    const nodes = e.nodeCount()
    let seed = 3
    const rnd = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < 100; i++) {
      const [phase, sounds] = PHASES[Math.floor(rnd() * PHASES.length)]
      e.onPhase({ phase, mode: null, indoor: rnd() < 0.5, duration: 0.2 + rnd() * 3, sounds })
      if (rnd() < 0.3) e.onFootstep(rnd() < 0.5 ? 'asphalt' : 'grass')
      tick(0.25)
    }
    expect(w.stats.created).toBe(created)
    expect(e.nodeCount()).toBe(nodes)
    expect(w.stats.badValues).toBe(0)
    e.onPhase({ phase: 'activity', mode: null, indoor: true, duration: 30, sounds: [] })
    tick(12)
    expect(e.activeOutputs()).toBe(0)
    const st = e.state()
    expect(st.train.presence).toBe(0)
    expect(st.vehicle.presence).toBe(0)
  })

  it('dispose освобождает все созданные узлы', () => {
    const { w, e } = makeEngine()
    e.dispose()
    expect(w.stats.disposed).toBe(w.stats.created - 1) // cityIn — узел микшера, не движка
    e.dispose() // повторно — без ошибок
    e.update()
    e.onPhase({ phase: 'metro-ride', indoor: true, duration: 3 })
  })

  it('метро: гул нарастает при прибытии и разгоне, тормоза скрипят при замедлении, поезд уходит после выхода', () => {
    const { e, tick, presence } = makeEngine()
    e.onPhase({ phase: 'metro-platform-wait', indoor: true, duration: 3 })
    tick(1)
    expect(e.state().train.presence).toBe(0)
    e.onPhase({ phase: 'metro-train-arrival', indoor: true, duration: 2, sounds: ['train-arrive', 'doors-open'] })
    tick(1)
    const p1 = e.state().train.presence
    tick(1.5)
    expect(e.state().train.presence).toBeGreaterThan(p1)
    expect(e.state().train.speed).toBeLessThan(0.7)
    e.onPhase({ phase: 'metro-departure', indoor: true, duration: 1, sounds: ['doors-close'] })
    tick(7)
    expect(e.state().train.speed).toBeGreaterThan(0.95)
    e.onPhase({ phase: 'metro-arriving', indoor: true, duration: 1.5 })
    let squeal = false
    const s = e as unknown as { squealBed: GatedLayer }
    for (let i = 0; i < 25; i++) {
      tick(0.2)
      squeal ||= s.squealBed.active
    }
    expect(squeal).toBe(true)
    e.onPhase({ phase: 'metro-alighting', indoor: true, duration: 1, sounds: ['doors-open'] })
    tick(9)
    expect(e.state().train.presence).toBe(0)
    expect(presence.at(-1)).toBe(0)
    expect(Math.max(...presence)).toBeGreaterThan(0.9)
  })

  it('автобус/такси: присутствие и холостой ход; поворотник только в поездке', () => {
    const { e, tick } = makeEngine()
    e.onPhase({ phase: 'bus-arrival', indoor: false, duration: 2 })
    tick(3)
    expect(e.state().vehicle.kind).toBe('bus')
    expect(e.state().vehicle.presence).toBeGreaterThan(0.9)
    expect(e.state().vehicle.speed).toBeLessThan(0.1)
    e.onPhase({ phase: 'bus-ride', indoor: true, duration: 10 })
    tick(5)
    expect(e.state().vehicle.speed).toBeGreaterThan(0.5)
    e.onPhase({ phase: 'bus-alighting', indoor: false, duration: 1 })
    tick(8)
    expect(e.state().vehicle.presence).toBe(0)
    expect(e.state().turnSignal).toBe(false)
    e.onPhase({ phase: 'taxi-boarding', indoor: false, duration: 1, sounds: ['car-door'] })
    tick(2)
    expect(e.state().vehicle.kind).toBe('taxi')
  })

  it('шаги: по улице — по событиям, в метро — сами по полу; светофор тикает только на переходе', () => {
    const { e, tick } = makeEngine()
    const before = e.counters.steps
    e.onFootstep('asphalt')
    expect(e.counters.steps).toBe(before + 1)
    e.onPhase({ phase: 'metro-transfer', indoor: true, duration: 3 })
    tick(3)
    expect(e.counters.steps).toBeGreaterThan(before + 3)
    e.onPhase({ phase: 'walk-crossing', indoor: false, duration: 2, sounds: ['crosswalk-signal'] })
    expect(e.state().crossing).toBe(true)
    tick(6)
    expect(e.state().crossing).toBe(false)
  })
})
