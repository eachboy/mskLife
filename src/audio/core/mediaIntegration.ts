import { LOCATIONS } from '../../data/locations'
import { WEATHER_PRESETS } from '../../features/weather/weatherData'
import { useAudioStore } from '../../stores/audioStore'
import { useWorldStore } from '../../stores/worldStore'
import type { MusicTrackInfo, WeatherKind } from '../../types'

export const MEDIA_ALBUM = 'mskLife — 2.5D Moscow Companion'
const TITLE_SUFFIX = 'mskLife'

export interface NowPlaying {
  title: string
  artist: string
  album: string
  /** заголовок вкладки, пока играет музыка */
  documentTitle: string
}

const MOOD_RU: Record<string, string> = { dawn: 'Рассвет', day: 'День', dusk: 'Закат', night: 'Ночь' }

/** Чистая функция: что показать в медиа-центре ОС и в заголовке вкладки. */
export function describeNowPlaying(location: string, weather: WeatherKind, track: MusicTrackInfo | null): NowPlaying {
  const place = LOCATIONS[location as keyof typeof LOCATIONS]?.name ?? 'Москва'
  const wx = WEATHER_PRESETS[weather]?.label ?? ''
  const where = wx ? `${place} • ${wx}` : place
  const mood = track ? (MOOD_RU[track.mood] ?? track.mood) : ''
  return {
    title: track ? `${track.title}${mood ? ` · ${mood}` : ''}` : 'LoFi Москва',
    artist: where,
    album: MEDIA_ALBUM,
    documentTitle: `♪ ${where} — ${TITLE_SUFFIX}`,
  }
}

export interface MediaActions {
  play: () => void
  pause: () => void
  next: () => void
}

type ActionName = 'play' | 'pause' | 'nexttrack'

/**
 * Медиа-клавиши, медиа-центр ОС (navigator.mediaSession) и заголовок вкладки.
 * Работает в фоне: только стор→DOM, без rAF. Возвращает cleanup (снимает обработчики, возвращает заголовок).
 */
export function installMediaIntegration(actions: MediaActions): () => void {
  const baseTitle = typeof document !== 'undefined' ? document.title : ''
  const ms: MediaSession | undefined = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined

  const apply = () => {
    const w = useWorldStore.getState()
    const a = useAudioStore.getState()
    const np = describeNowPlaying(w.location, w.weatherKind, a.track)
    const playing = a.musicPlaying && a.engineState === 'running'
    if (typeof document !== 'undefined') document.title = playing ? np.documentTitle : baseTitle
    if (!ms) return
    try {
      if (typeof MediaMetadata === 'function') {
        const m = ms.metadata
        if (!m || m.title !== np.title || m.artist !== np.artist) {
          ms.metadata = new MediaMetadata({ title: np.title, artist: np.artist, album: np.album })
        }
      }
      ms.playbackState = playing ? 'playing' : 'paused'
    } catch {
      /* старые браузеры: без медиа-центра */
    }
  }

  const handlers: Array<[ActionName, () => void]> = [
    ['play', actions.play],
    ['pause', actions.pause],
    ['nexttrack', actions.next],
  ]
  if (ms) {
    for (const [name, fn] of handlers) {
      try {
        ms.setActionHandler(name, fn)
      } catch {
        /* действие не поддерживается */
      }
    }
  }

  apply()
  const offW = useWorldStore.subscribe((w, p) => {
    if (w.location !== p.location || w.weatherKind !== p.weatherKind) apply()
  })
  const offA = useAudioStore.subscribe((a, p) => {
    if (a.track !== p.track || a.musicPlaying !== p.musicPlaying || a.engineState !== p.engineState) apply()
  })

  return () => {
    offW()
    offA()
    if (ms) {
      for (const [name] of handlers) {
        try {
          ms.setActionHandler(name, null)
        } catch {
          /* ignore */
        }
      }
      try {
        ms.metadata = null
        ms.playbackState = 'none'
      } catch {
        /* ignore */
      }
    }
    if (typeof document !== 'undefined') document.title = baseTitle
  }
}
