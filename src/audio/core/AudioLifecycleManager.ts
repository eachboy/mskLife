import { LOCATIONS } from '../../data/locations'
import { useAudioStore } from '../../stores/audioStore'
import { useMapStore } from '../../stores/mapStore'
import { installMediaIntegration } from './mediaIntegration'
import { useWorldStore } from '../../stores/worldStore'
import { TIME_SCALE, eventRealSeconds } from '../../simulation/time/simClock'
import type { LocationId, ScenarioEvent, TimeMode } from '../../types'
import { eventBus } from '../../utils/eventBus'
import type { AudioMixer, BusId } from '../engine/AudioMixer'
import type { CitySoundEngine } from '../engine/CitySoundEngine'
import type { MusicEngine, MusicLayer, MusicStats } from '../engine/MusicEngine'
import type { TravelSoundEngine, TravelSoundInput } from '../engine/TravelSoundEngine'
import type { ToneModule } from '../engine/audioUtils'
import type { WeatherSoundEngine } from '../engine/WeatherSoundEngine'

/** Частота обновления погоды/города, с (таймер Tone-контекста — не троттлится в фоне, в отличие от setInterval). */
const UPDATE_SEC = 0.2

// ───────── счётчик AudioContext (только dev / ?audiodebug) ─────────

const ctxRegistry: BaseAudioContext[] = []
let counterInstalled = false

/**
 * Оборачивает конструктор AudioContext, чтобы диагностика видела все созданные контексты (B-11).
 * Вызывать ДО импорта tone (standardized-audio-context берёт конструктор при загрузке модуля).
 */
export function installContextCounter(win: Window & typeof globalThis = window): void {
  if (counterInstalled) return
  const Native = win.AudioContext as typeof AudioContext | undefined
  if (!Native) return
  counterInstalled = true
  class Counted extends Native {
    constructor(...args: ConstructorParameters<typeof AudioContext>) {
      super(...args)
      ctxRegistry.push(this)
    }
  }
  win.AudioContext = Counted
}

/** Число живых AudioContext, созданных после installContextCounter(); null — счётчик не установлен. */
export function liveContextCount(): number | null {
  return counterInstalled ? ctxRegistry.filter((c) => (c.state as string) !== 'closed').length : null
}

/** Только для тестов. */
export function resetContextCounter(): void {
  ctxRegistry.length = 0
  counterInstalled = false
}

const debugEnabled = (): boolean => import.meta.env.DEV || (typeof location !== 'undefined' && location.search.includes('audiodebug'))

export type TestSignal = 'sine-220' | 'sine-440' | 'sine-1k' | 'sweep' | 'pink'

interface Session {
  T: ToneModule
  mixer: AudioMixer
  music: MusicEngine
  weather: WeatherSoundEngine
  city: CitySoundEngine
  travel: TravelSoundEngine
  cleanups: Array<() => void>
  test: { dispose: () => void } | null
}

export interface AudioDiagnostics {
  contextState: string
  sampleRate: number
  baseLatency: number
  transportState: string
  music: MusicStats
  nodes: { music: number; weather: number; city: number; travel: number }
  /** фаза путешествия, которую сейчас озвучивает travel-движок */
  travelPhase: string | null
  /** сколько аудио-сессий создано за жизнь страницы */
  instances: number
  /** живых (не closed) AudioContext на странице; null — счётчик не установлен (только dev / ?audiodebug) */
  contexts: number | null
  solo: MusicLayer[] | null
  testSignal: TestSignal | null
  lastRecovery: string | null
}

/**
 * Единственный владелец звука в приложении (синглтон, не зависит от React).
 *
 * Правила жизненного цикла (раздел 3 ТЗ):
 *  - скрытие вкладки / сворачивание / blur НЕ приостанавливают контекст и Transport;
 *  - размонтирование UI не трогает звук; dispose() — только для тестов и HMR;
 *  - при возврате (visibilitychange→visible, pageshow, resume, focus) проверяем контекст и
 *    Transport и возобновляем их, не создавая второй экземпляр;
 *  - если браузер приостановил контекст сам (iOS/блокировка/Bluetooth), возобновляем по
 *    следующему жесту пользователя.
 */
class AudioLifecycleManager {
  private session: Session | null = null
  private starting: Promise<void> | null = null
  private gen = 0
  /** сколько сессий создано за жизнь страницы (диагностика дублей) */
  private created = 0
  private testKind: TestSignal | null = null
  private lastRecovery: string | null = null

  /** Идемпотентный старт: повторные вызовы возвращают тот же промис / ничего не делают. */
  start(): Promise<void> {
    if (this.session) return this.ensureRunning('start')
    if (!this.starting) this.starting = this.boot().finally(() => (this.starting = null))
    return this.starting
  }

  get running(): boolean {
    return !!this.session
  }

  private async boot(): Promise<void> {
    const gen = ++this.gen
    const audio = useAudioStore.getState()
    audio.setEngineState('starting')
    const cleanups: Array<() => void> = []
    const aborted = () => gen !== this.gen
    try {
      if (debugEnabled()) installContextCounter()
      const T = await import('tone')
      const [{ AudioMixer }, { MusicEngine }, { WeatherSoundEngine }, { CitySoundEngine }, { TravelSoundEngine }] = await Promise.all([
        import('../engine/AudioMixer'),
        import('../engine/MusicEngine'),
        import('../engine/WeatherSoundEngine'),
        import('../engine/CitySoundEngine'),
        import('../engine/TravelSoundEngine'),
      ])
      if (aborted()) return
      const mixer = new AudioMixer(T)
      cleanups.push(() => mixer.dispose())
      await mixer.start()
      const weather = new WeatherSoundEngine(T, mixer)
      cleanups.push(() => weather.dispose())
      weather.init()
      const city = new CitySoundEngine(T, mixer)
      cleanups.push(() => city.dispose())
      city.init()
      const travel = new TravelSoundEngine(T, mixer, { onTrainPresence: (p) => city.setTrainPresence(p) })
      cleanups.push(() => travel.dispose())
      travel.init()
      const music = new MusicEngine(
        T,
        mixer,
        () => {
          const w = useWorldStore.getState()
          return { minutes: w.minutes, rain: w.weather.rain, snow: w.weather.snow }
        },
        { onTrack: (t) => useAudioStore.getState().setTrack(t), onPhrase: () => useAudioStore.getState().pulse() },
      )
      cleanups.push(() => music.dispose())
      await music.init()
      if (aborted()) {
        run(cleanups)
        return
      }
      const s: Session = { T, mixer, music, weather, city, travel, cleanups, test: null }
      this.wire(s)
      music.start()
      this.session = s
      this.created++
      useAudioStore.getState().setEngineState('running')
      if (debugEnabled()) (window as unknown as { __audio?: unknown }).__audio = { T, mixer, music, weather, city, travel, manager: this }
    } catch (e) {
      console.error('[audio] start failed', e)
      run(cleanups)
      if (!aborted()) useAudioStore.getState().setEngineState('error', e instanceof Error ? e.message : String(e))
    }
  }

  /** Подписки на сторы/события + обработчики жизненного цикла страницы. */
  private wire(s: Session): void {
    const { mixer, music, weather, city, travel } = s
    const push = (fn: () => void) => s.cleanups.push(fn)

    let lastKey = ''
    const applyAudio = (a: ReturnType<typeof useAudioStore.getState>) => {
      const key = [a.musicVolume, a.cityVolume, a.weatherVolume, a.masterVolume, a.cityMuted, a.weatherMuted, a.musicPlaying].join('|')
      if (key === lastKey) return
      lastKey = key
      mixer.setLevels({ music: a.musicVolume, city: a.cityVolume, weather: a.weatherVolume, master: a.masterVolume, cityMuted: a.cityMuted, weatherMuted: a.weatherMuted })
      music.setPlaying(a.musicPlaying)
    }
    applyAudio(useAudioStore.getState())
    push(useAudioStore.subscribe(applyAudio))

    const applyLocation = (id: LocationId | string) => {
      const def = LOCATIONS[id as LocationId]
      if (def) city.setAmbience(def.ambience)
    }
    const applyEvent = (ev: ScenarioEvent | null) => {
      if (!ev) return
      const input = travelInput(ev, useWorldStore.getState().timeMode)
      // silent (перемотка после фона): ни одноразовых звуков, ни подсказок — только состояние модели
      travel.onPhase(ev.silent ? { ...input, sounds: [], silent: true } : input)
    }
    const w0 = useWorldStore.getState()
    applyLocation(w0.location)
    // старт посреди поездки: модель встаёт в текущую фазу без одноразовых звуков
    if (w0.event) travel.onPhase({ ...travelInput(w0.event, w0.timeMode), sounds: [], silent: true })
    push(
      useWorldStore.subscribe((w, prev) => {
        // кинематографичный переход (§5.5): занавес → эмбиент проседает; новая сцена → кроссфейд слоёв
        if (w.location !== prev.location) applyLocation(w.location)
        if (w.transitionTo !== prev.transitionTo) {
          if (w.transitionTo) city.beginTransition()
          else city.endTransition()
        }
        if (w.eventKey !== prev.eventKey) applyEvent(w.event)
      }),
    )
    // карта открыта → «вид сверху»: город и погода глуше (музыка не затрагивается)
    mixer.setMapOverviewMode(useMapStore.getState().open)
    push(
      useMapStore.subscribe((m, prev) => {
        if (m.open !== prev.open) mixer.setMapOverviewMode(m.open)
      }),
    )

    // медиа-клавиши + медиа-центр ОС + заголовок вкладки
    push(
      installMediaIntegration({
        play: () => {
          useAudioStore.getState().setMusicPlaying(true)
          void this.ensureRunning('media-play')
        },
        pause: () => useAudioStore.getState().setMusicPlaying(false),
        next: () => {
          useAudioStore.getState().setMusicPlaying(true)
          music.nextTrack()
        },
      }),
    )

    push(eventBus.on('lightning', ({ distance }) => weather.onLightning(distance)))
    push(
      eventBus.on('footstep', ({ surface }) => {
        weather.onFootstep(surface)
        travel.onFootstep(surface)
      }),
    )
    push(eventBus.on('vehicle-pass', ({ kind }) => city.onVehiclePass(kind)))

    // таймер аудиоконтекста (Tone ticker в Worker) — продолжает работать в фоновой вкладке
    const id = mixer.context.setInterval(() => {
      try {
        const w = useWorldStore.getState()
        const amb = LOCATIONS[w.location]?.ambience
        weather.update({ weather: w.weather, minutes: w.minutes, birds: amb?.birds ?? 0, indoor: amb?.indoor ?? 0 })
        city.update()
        travel.update()
      } catch (e) {
        console.warn('[audio] update', e)
      }
    }, UPDATE_SEC)
    push(() => mixer.context.clearInterval(id))

    // жизненный цикл страницы: только проверка и восстановление, никаких suspend/close
    const recover = (why: string) => void this.ensureRunning(why)
    const onVisible = () => {
      if (document.visibilityState === 'visible') recover('visible')
    }
    const onPageShow = (e: PageTransitionEvent) => recover(e.persisted ? 'pageshow-bfcache' : 'pageshow')
    const onResume = () => recover('resume')
    const onFocus = () => recover('focus')
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('resume', onResume)
    window.addEventListener('focus', onFocus)
    push(() => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('resume', onResume)
      window.removeEventListener('focus', onFocus)
    })

    // браузер сам приостановил/прервал контекст → ждём жеста пользователя
    const raw = mixer.context.rawContext as AudioContext
    const onState = () => {
      const st = raw.state as string
      if (st === 'running') {
        useAudioStore.getState().setEngineState('running')
      } else if (st === 'suspended' || st === 'interrupted') {
        useAudioStore.getState().setEngineState('interrupted')
      }
    }
    raw.addEventListener('statechange', onState)
    push(() => raw.removeEventListener('statechange', onState))
    const onGesture = () => {
      if ((raw.state as string) !== 'running') recover('gesture')
    }
    window.addEventListener('pointerdown', onGesture, true)
    window.addEventListener('keydown', onGesture, true)
    push(() => {
      window.removeEventListener('pointerdown', onGesture, true)
      window.removeEventListener('keydown', onGesture, true)
    })
  }

  /** Проверить и восстановить контекст и планирование. Не создаёт второй экземпляр. */
  async ensureRunning(reason = 'check'): Promise<void> {
    const s = this.session
    if (!s) return
    const raw = s.mixer.context.rawContext as AudioContext
    if ((raw.state as string) !== 'running') {
      await s.mixer.resume()
      this.lastRecovery = `${reason}: context ${raw.state}`
    }
    if (!s.music.isScheduling) {
      s.music.ensureScheduling()
      this.lastRecovery = `${reason}: transport restarted`
    }
  }

  // ───────── визуализатор / диагностика ─────────

  analyser(bus: BusId): AnalyserNode | null {
    return this.session?.mixer.analyser(bus) ?? null
  }

  setSolo(layers: MusicLayer[] | null): void {
    this.session?.music.setSolo(layers)
  }

  /** Тестовый сигнал в музыкальную шину (проверка визуализатора и уровней). null — выключить. */
  setTestSignal(kind: TestSignal | null): void {
    const s = this.session
    if (!s) return
    s.test?.dispose()
    s.test = null
    this.testKind = kind
    if (!kind) return
    const T = s.T
    const out = new T.Gain(0)
    out.connect(s.mixer.musicIn)
    let src: { start: (t?: number) => unknown; dispose: () => unknown; connect: (n: never) => unknown }
    if (kind === 'pink') {
      src = new T.Noise('pink')
    } else {
      const f = kind === 'sine-220' ? 220 : kind === 'sine-440' ? 440 : kind === 'sine-1k' ? 1000 : 60
      const osc = new T.Oscillator({ frequency: f, type: 'sine' })
      if (kind === 'sweep') {
        const lfo = new T.LFO({ frequency: 1 / 8, min: 60, max: 8000, type: 'sawtooth' })
        lfo.connect(osc.frequency)
        lfo.start()
        const prev = osc.dispose.bind(osc)
        osc.dispose = () => {
          lfo.dispose()
          return prev()
        }
      }
      src = osc as never
    }
    src.connect(out as never)
    src.start()
    out.gain.rampTo(0.25, 0.05)
    s.test = {
      dispose: () => {
        out.gain.rampTo(0, 0.05)
        s.mixer.context.setTimeout(() => {
          src.dispose()
          out.dispose()
        }, 0.1)
      },
    }
  }

  diagnostics(): AudioDiagnostics | null {
    const s = this.session
    if (!s) return null
    const raw = s.mixer.context.rawContext as AudioContext
    return {
      contextState: raw.state,
      sampleRate: raw.sampleRate,
      baseLatency: raw.baseLatency ?? 0,
      transportState: s.mixer.context.transport.state,
      music: s.music.stats(),
      nodes: { music: s.music.stats().nodes, weather: s.weather.nodeCount(), city: s.city.nodeCount(), travel: s.travel.nodeCount() },
      travelPhase: s.travel.state().phase,
      instances: this.created,
      contexts: liveContextCount(),
      solo: s.music.getSolo(),
      testSignal: this.testKind,
      lastRecovery: this.lastRecovery,
    }
  }

  /** Полная очистка — только тесты/HMR. Обычное размонтирование UI сюда не ведёт. */
  dispose(): void {
    this.gen++
    const s = this.session
    this.session = null
    if (!s) return
    s.test?.dispose()
    run(s.cleanups)
    useAudioStore.getState().setEngineState('idle')
  }
}

/** Вход звука поездки: duration — РЕАЛЬНЫЕ секунды фазы (игровые минуты × 60 / масштаб режима времени). */
export function travelInput(ev: ScenarioEvent, timeMode: TimeMode): TravelSoundInput {
  return {
    phase: ev.phase ?? 'activity',
    mode: ev.mode ?? null,
    indoor: !(LOCATIONS[ev.location]?.outdoor ?? true),
    duration: eventRealSeconds(ev.duration, TIME_SCALE[timeMode]),
    sounds: ev.sounds ?? [],
  }
}

function run(fns: Array<() => void>): void {
  for (const fn of fns.splice(0).reverse()) {
    try {
      fn()
    } catch (e) {
      console.warn('[audio] cleanup', e)
    }
  }
}

export const audioLifecycle = new AudioLifecycleManager()

// HMR: старый модуль освобождает звук, чтобы не было двух экземпляров музыки
if (import.meta.hot) import.meta.hot.dispose(() => audioLifecycle.dispose())
