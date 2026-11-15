import { create } from 'zustand'
import type { MusicTrackInfo } from '../types'

export const VIZ_MODES = ['bars', 'spectrum', 'wave', 'off'] as const
export type VizMode = (typeof VIZ_MODES)[number]

/**
 * Состояние аудио. UI пишет сюда громкости, AudioLifecycleManager читает их
 * и применяет к AudioMixer. Движок пишет обратно `track` и `engineState`.
 * Громкости — линейные 0..1.
 */
export interface AudioState {
  /** interrupted — браузер приостановил контекст сам (блокировка, другое аудиоприложение); возобновится по жесту */
  engineState: 'idle' | 'starting' | 'running' | 'interrupted' | 'error'
  errorMessage: string | null
  musicPlaying: boolean
  musicVolume: number
  cityVolume: number
  weatherVolume: number
  /** общая громкость 0..1 */
  masterVolume: number
  cityMuted: boolean
  weatherMuted: boolean
  track: MusicTrackInfo | null
  /** вид визуализатора в плеер-баре */
  vizMode: VizMode
  /** растёт на 1 при каждой новой фразе/смене трека — для визуального пульса */
  beat: number

  setEngineState: (s: AudioState['engineState'], err?: string | null) => void
  setMusicPlaying: (v: boolean) => void
  setMusicVolume: (v: number) => void
  setCityVolume: (v: number) => void
  setWeatherVolume: (v: number) => void
  setMasterVolume: (v: number) => void
  toggleCityMuted: () => void
  toggleWeatherMuted: () => void
  setTrack: (t: MusicTrackInfo) => void
  setVizMode: (m: VizMode) => void
  pulse: () => void
}

const load = (key: string, fallback: number): number => {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback
  } catch {
    return fallback
  }
}
const loadViz = (): VizMode => {
  try {
    const v = localStorage.getItem('ml.viz')
    return (VIZ_MODES as readonly string[]).includes(v ?? '') ? (v as VizMode) : 'bars'
  } catch {
    return 'bars'
  }
}
const save = (key: string, v: number | string) => {
  try {
    localStorage.setItem(key, String(v))
  } catch {
    /* ignore */
  }
}

export const useAudioStore = create<AudioState>((set) => ({
  engineState: 'idle',
  errorMessage: null,
  musicPlaying: true,
  musicVolume: load('ml.music', 0.7),
  cityVolume: load('ml.city', 0.5),
  weatherVolume: load('ml.weather', 0.55),
  masterVolume: load('ml.master', 0.9),
  cityMuted: false,
  weatherMuted: false,
  track: null,
  vizMode: loadViz(),
  beat: 0,

  setEngineState: (engineState, err = null) => set({ engineState, errorMessage: err }),
  setMusicPlaying: (musicPlaying) => set({ musicPlaying }),
  setMusicVolume: (musicVolume) => {
    save('ml.music', musicVolume)
    set({ musicVolume })
  },
  setCityVolume: (cityVolume) => {
    save('ml.city', cityVolume)
    set({ cityVolume })
  },
  setWeatherVolume: (weatherVolume) => {
    save('ml.weather', weatherVolume)
    set({ weatherVolume })
  },
  setMasterVolume: (masterVolume) => {
    save('ml.master', masterVolume)
    set({ masterVolume })
  },
  toggleCityMuted: () => set((s) => ({ cityMuted: !s.cityMuted })),
  toggleWeatherMuted: () => set((s) => ({ weatherMuted: !s.weatherMuted })),
  setTrack: (track) => set({ track }),
  setVizMode: (vizMode) => {
    save('ml.viz', vizMode)
    set({ vizMode })
  },
  pulse: () => set((s) => ({ beat: s.beat + 1 })),
}))
