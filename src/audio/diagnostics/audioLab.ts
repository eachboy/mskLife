// Offline-лаборатория звука: рендерит движки в OfflineAudioContext быстрее реального времени
// и возвращает статистику сигнала. Используется e2e/audio.spec.ts и scripts/audio-lab.mjs через
// window.__audioLab (dev или ?audiodebug). Ничего не воспроизводит в колонки.
import type { AmbienceProfile, TravelMode, TravelPhase, TravelSoundCue, WeatherParams } from '../../types'
import type { StepSurface } from '../engine/TravelSoundEngine'
import { type SignalStats, signalStats } from './signalStats'

/** Событие таймлайна путешествия в лаборатории (at — секунды от начала рендера). */
export interface LabTravelEvent {
  at: number
  /** фаза Travel State Machine (как worldStore.event) */
  phase?: TravelPhase
  mode?: TravelMode | null
  indoor?: boolean
  duration?: number
  sounds?: TravelSoundCue[]
  /** новая локация: эмбиент города (кроссфейд) */
  ambience?: AmbienceProfile
  /** занавес перехода: begin — эмбиент проседает; end приходит вместе с ambience */
  transition?: 'begin' | 'end'
  /** шаги героя на улице до момента until */
  steps?: { surface: StepSurface; until: number; every?: number }
}

export interface LabScenario {
  seconds: number
  seed?: number
  /** какие шины включить */
  music?: boolean
  city?: AmbienceProfile | null
  weather?: Partial<WeatherParams> | null
  /** игровое время для генератора (влияет на настроение/темп) */
  minutes?: number
  /** соло слоёв музыки (если движок поддерживает) */
  solo?: string[]
  /** таймлайн фаз путешествия (включает travel-движок и городскую шину) */
  travel?: LabTravelEvent[]
  /** громкости шин 0..1 */
  levels?: { music?: number; city?: number; weather?: number }
}

export interface LabResult extends SignalStats {
  seconds: number
  renderMs: number
  /** доля реального времени на JS-планирование Tone (offline) */
  jsLoad: number
  /** доля реального времени на нативный рендер графа ≈ нагрузка аудиопотока */
  graphLoad: number
  /** опоздавшие/пропущенные шаги планировщика (если движок считает) */
  lateSteps?: number
  droppedNotes?: number
  /** Tone-узлов города+погоды+travel в начале и в конце рендера (рост = утечка) */
  nodesStart?: number
  nodesEnd?: number
  /** сколько выходов travel-движка подключено к шине в конце (после тишины должно быть 0) */
  travelActiveEnd?: number
  travelPhases?: number
  /** RMS по окнам 0.5 с, dBFS */
  profile?: number[]
}

const CALM: WeatherParams = { rain: 0, snow: 0, wind: 0.15, fog: 0, cloud: 0.2, storm: 0 } as WeatherParams

export async function renderOffline(sc: LabScenario): Promise<LabResult> {
  const T = await import('tone')
  const [{ AudioMixer }, { MusicEngine }, { WeatherSoundEngine }, { CitySoundEngine }, { TravelSoundEngine }] = await Promise.all([
    import('../engine/AudioMixer'),
    import('../engine/MusicEngine'),
    import('../engine/WeatherSoundEngine'),
    import('../engine/CitySoundEngine'),
    import('../engine/TravelSoundEngine'),
  ])
  const SR = 48000
  const weatherParams: WeatherParams = { ...CALM, ...(sc.weather ?? {}) }
  const minutes = sc.minutes ?? 14 * 60
  let music: InstanceType<typeof MusicEngine> | null = null
  const counted: Array<{ nodeCount: () => number }> = []
  let travel: InstanceType<typeof TravelSoundEngine> | null = null
  let nodesStart = 0
  // Вместо T.Offline рендерим вручную, чтобы разделить стоимость: JS-тики Tone (планирование)
  // и нативный рендер графа (это и есть нагрузка на аудиопоток в реальном времени).
  const original = T.getContext()
  // Нативный OfflineAudioContext (не обёртка standardized-audio-context): обёртка откладывает
  // автоматизацию/подключения до startRendering, а нам нужен рендер кусками (suspend/resume).
  const nativeCtx = typeof OfflineAudioContext === 'function' ? new OfflineAudioContext(2, Math.round(sc.seconds * SR), SR) : null
  const off = nativeCtx ? new T.OfflineContext(nativeCtx as never) : new T.OfflineContext(2, sc.seconds, SR)
  T.setContext(off)
  const build = async ({ transport }: { transport: ReturnType<typeof T.getTransport> }) => {
      const mixer = new AudioMixer(T, { useCurrentContext: true })
      mixer.setLevels({
        music: sc.music === false ? 0 : (sc.levels?.music ?? 0.7),
        city: sc.city || sc.travel ? (sc.levels?.city ?? 0.5) : 0,
        weather: sc.weather ? (sc.levels?.weather ?? 0.55) : 0,
        cityMuted: !sc.city && !sc.travel,
        weatherMuted: !sc.weather,
      })
      if (sc.weather) {
        const w = new WeatherSoundEngine(T, mixer)
        w.init()
        // как в приложении: тикер контекста, а не Transport (update() планирует от ctx.now())
        off.setInterval(() => w.update({ weather: weatherParams, minutes, birds: 0.6, indoor: 0 }), 0.2)
        counted.push(w)
      }
      if (sc.city || sc.travel) {
        const c = new CitySoundEngine(T, mixer)
        c.init()
        const zero: AmbienceProfile = { traffic: 0, crowd: 0, birds: 0, water: 0, metro: 0, cafe: 0, office: 0, wind: 0, indoor: 0 }
        c.setAmbience(sc.city ?? zero)
        off.setInterval(() => c.update(), 0.2)
        counted.push(c)
        if (sc.travel) {
          const tr = new TravelSoundEngine(T, mixer, { onTrainPresence: (p) => c.setTrainPresence(p) })
          tr.init()
          travel = tr
          counted.push(tr)
          off.setInterval(() => tr.update(), 0.2)
          for (const e of sc.travel) {
            off.setTimeout(() => {
              if (e.transition === 'begin') c.beginTransition()
              if (e.ambience) c.setAmbience(e.ambience)
              if (e.transition === 'end') c.endTransition()
              if (e.phase) tr.onPhase({ phase: e.phase, mode: e.mode ?? null, indoor: !!e.indoor, duration: e.duration ?? 1, sounds: e.sounds ?? [] })
              if (e.steps) {
                const every = e.steps.every ?? 0.55
                for (let t = e.at; t < e.steps.until; t += every) off.setTimeout(() => tr.onFootstep(e.steps!.surface), Math.max(0, t - e.at))
              }
            }, e.at)
          }
        }
      }
      nodesStart = counted.reduce((a, e) => a + e.nodeCount(), 0)
      if (sc.music !== false) {
        music = new MusicEngine(T, mixer, () => ({ minutes, rain: weatherParams.rain, snow: weatherParams.snow }), {}, sc.seed ?? 12345)
        await music.init()
        const m = music as unknown as { setSolo?: (s: string[] | null) => void }
        if (sc.solo && m.setSolo) m.setSolo(sc.solo)
        music.start()
      } else {
        transport.start(0)
      }
  }
  let jsMs = 0
  let nativeMs = 0
  let raw: AudioBuffer
  try {
    await build({ transport: off.transport as ReturnType<typeof T.getTransport> })
    const priv = off as unknown as {
      _renderClock: (a: boolean) => Promise<void>
      _context: OfflineAudioContext
      _currentTime: number
      _duration: number
      workletsAreReady: () => Promise<void>
    }
    await priv.workletsAreReady()
    const native = nativeCtx
    if (native && typeof native.suspend === 'function') {
      // Рендер кусками с часами Tone, идущими вместе с рендером (на кусок вперёд), — как в
      // реальном времени. Иначе (сначала все тики, потом рендер) connect/disconnect гейтов
      // применились бы к графу ДО рендера: слой, отключённый в конце, молчал бы весь рендер.
      const step = 128 / SR
      const chunk = step * 20
      const advanceTo = (until: number) => {
        const t0 = performance.now()
        while (priv._currentTime < until && priv._duration - priv._currentTime >= 0) {
          off.emit('tick')
          priv._currentTime += step
        }
        jsMs += performance.now() - t0
      }
      for (let k = 1; k * chunk < sc.seconds; k++) {
        const at = k * chunk
        void native.suspend(at).then(() => {
          advanceTo(at + chunk)
          void native.resume()
        })
      }
      const t1 = performance.now()
      advanceTo(chunk)
      raw = await native.startRendering()
      nativeMs = performance.now() - t1 - jsMs
    } else {
      const t1 = performance.now()
      await priv._renderClock(false)
      const t2 = performance.now()
      raw = await priv._context.startRendering()
      jsMs = t2 - t1
      nativeMs = performance.now() - t2
    }
  } finally {
    T.setContext(original)
  }
  const renderMs = Math.round(jsMs + nativeMs)
  const chans = Array.from({ length: raw.numberOfChannels }, (_, i) => raw.getChannelData(i))
  const st = signalStats(chans, SR)
  // огибающая громкости по 0.5 с (dBFS RMS) — видно нарастание/спад гула, провалы на переходах
  const win = SR / 2
  const profile: number[] = []
  for (let i = 0; i + win <= chans[0].length; i += win) {
    let e = 0
    for (const ch of chans) for (let j = i; j < i + win; j++) e += ch[j] * ch[j]
    const r = Math.sqrt(e / (win * chans.length))
    profile.push(r > 0 ? Math.round(20 * Math.log10(r) * 10) / 10 : -120)
  }
  const stats = (music as unknown as { stats?: () => { lateSteps: number; droppedNotes: number; ticks: number } } | null)?.stats?.()
  const tr = travel as InstanceType<typeof TravelSoundEngine> | null
  const extra = counted.length
    ? {
        nodesStart,
        nodesEnd: counted.reduce((a, e) => a + e.nodeCount(), 0),
        ...(tr ? { travelActiveEnd: tr.activeOutputs(), travelPhases: tr.counters.phases } : {}),
      }
    : {}
  return { ...st, profile, seconds: sc.seconds, renderMs, jsLoad: jsMs / 1000 / sc.seconds, graphLoad: nativeMs / 1000 / sc.seconds, ...(stats ?? {}), ...extra } as LabResult
}
