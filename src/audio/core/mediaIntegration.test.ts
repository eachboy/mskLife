import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAudioStore } from '../../stores/audioStore'
import { useWorldStore } from '../../stores/worldStore'
import { MAP_OPEN_LP_HZ, MAP_OVERVIEW_LP_HZ, mapOverviewTargets } from '../engine/AudioMixer'
import { describeNowPlaying, installMediaIntegration, MEDIA_ALBUM } from './mediaIntegration'

describe('describeNowPlaying', () => {
  it('артист = локация • погода, альбом фиксирован, заголовок вкладки с нотой', () => {
    const np = describeNowPlaying('arbat', 'light-rain', { title: 'Тихий двор', key: 'C major', bpm: 72, mood: 'dusk' })
    expect(np.artist).toBe('Арбат • Лёгкий дождь')
    expect(np.album).toBe(MEDIA_ALBUM)
    expect(np.title).toContain('Тихий двор')
    expect(np.documentTitle).toBe('♪ Арбат • Лёгкий дождь — mskLife')
  })
})

describe('mapOverviewTargets', () => {
  it('карта открыта: 650 Гц и −4 дБ; закрыта: 18 кГц и 1', () => {
    const open = mapOverviewTargets(true)
    expect(open.cutoffHz).toBe(MAP_OVERVIEW_LP_HZ)
    expect(20 * Math.log10(open.trim)).toBeCloseTo(-4, 5)
    expect(mapOverviewTargets(false)).toEqual({ cutoffHz: MAP_OPEN_LP_HZ, trim: 1 })
  })
})

describe('installMediaIntegration', () => {
  const handlers = new Map<string, (() => void) | null>()
  const session = {
    metadata: null as unknown,
    playbackState: 'none',
    setActionHandler: (n: string, fn: (() => void) | null) => void handlers.set(n, fn),
  }
  afterEach(() => handlers.clear())

  it('вешает play/pause/nexttrack и обновляет заголовок вкладки, пока играет звук', () => {
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(public init: object) {
          Object.assign(this, init)
        }
      },
    )
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session })
    document.title = 'orig'
    useAudioStore.setState({ engineState: 'running', musicPlaying: true, track: null })
    useWorldStore.setState({ location: 'arbat', weatherKind: 'clear' })
    const actions = { play: vi.fn(), pause: vi.fn(), next: vi.fn() }
    const off = installMediaIntegration(actions)
    expect(document.title).toBe('♪ Арбат • Ясно — mskLife')
    handlers.get('nexttrack')?.()
    handlers.get('pause')?.()
    expect(actions.next).toHaveBeenCalledOnce()
    expect(actions.pause).toHaveBeenCalledOnce()
    useWorldStore.setState({ weatherKind: 'light-rain' })
    expect(document.title).toBe('♪ Арбат • Лёгкий дождь — mskLife')
    useAudioStore.setState({ musicPlaying: false })
    expect(document.title).toBe('orig')
    off()
    expect(handlers.get('play')).toBeNull()
    vi.unstubAllGlobals()
  })
})
