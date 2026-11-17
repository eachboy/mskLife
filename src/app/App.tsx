import { AnimatePresence } from 'framer-motion'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useAudioEngine } from '../audio/hooks/useAudioEngine'
import { BottomBar, type PanelId } from '../components/controls/BottomBar'
import { PanelHost } from '../components/controls/Panels'
import { CaptionToast, Curtain, TitleCard, TopBar } from '../components/layout/Overlays'
import { StartScreen } from '../components/StartScreen'
import { CityMapHub } from '../features/city/CityMapHub'
import { MiniRadar } from '../features/city/MiniRadar'
import { weatherManager } from '../features/weather/WeatherManager'
import { SceneStage } from '../scenes/SceneStage'
import { scenarioEngine } from '../simulation/engine/ScenarioEngine'
import { useAudioStore } from '../stores/audioStore'
import { useMapStore } from '../stores/mapStore'
import { useWorldStore } from '../stores/worldStore'
import { useZenMode } from './useZenMode'

// Диагностика звука — отдельный чанк, грузится только по ?audiodiag
const AUDIO_DIAG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('audiodiag')
const AudioDiagnosticsPanel = lazy(() => import('../components/player/AudioDiagnosticsPanel'))

export default function App() {
  const started = useWorldStore((s) => s.started)
  const mapOpen = useMapStore((s) => s.open)
  const audio = useAudioEngine()
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState<PanelId>(null)
  const [fullscreen, setFullscreen] = useState(false)

  // Zen Mode: чистая сцена после 12 с покоя (не при открытой панели или карте)
  useZenMode(started && panel === null && !mapOpen)

  // стартовая сцена под экраном приветствия + авто-экономия для слабых устройств
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const weak = (navigator.hardwareConcurrency ?? 8) <= 2
    if (reduce || weak) useWorldStore.getState().patch({ lowPerf: true })
    scenarioEngine.prepare()
    return () => {
      scenarioEngine.stop()
      weatherManager.stop()
    }
  }, [])

  const enter = useCallback(async () => {
    if (busy || useWorldStore.getState().started) return
    setBusy(true)
    useWorldStore.getState().patch({ started: true })
    weatherManager.start()
    scenarioEngine.start()
    try {
      await audio.start() // пользовательский жест → разрешён AudioContext
    } catch (e) {
      console.warn('[audio] start failed', e)
    }
    setBusy(false)
  }, [audio, busy])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.().catch(() => undefined)
  }, [])

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (!useWorldStore.getState().started) return
      if (e.code === 'Space') {
        e.preventDefault()
        const a = useAudioStore.getState()
        a.setMusicPlaying(!a.musicPlaying)
      } else if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      else if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!useMapStore.getState().diving) useMapStore.getState().toggleMap()
      } else if (e.key === 'Escape') {
        const m = useMapStore.getState()
        if (m.open) {
          // сначала закрываем карточку, затем саму карту
          if (m.selected) m.select(null)
          else if (!m.diving) m.closeMap()
        } else setPanel(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen])

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#120e24]">
      <SceneStage />
      <Curtain />
      {started && (
        <>
          <AnimatePresence>{mapOpen && <CityMapHub key="city-map" />}</AnimatePresence>
          {!mapOpen && <MiniRadar />}
          <TopBar />
          <TitleCard />
          <CaptionToast />
          <PanelHost panel={panel} setPanel={setPanel} />
          <BottomBar panel={panel} setPanel={setPanel} onToggleFullscreen={toggleFullscreen} fullscreen={fullscreen} />
          {AUDIO_DIAG && (
            <Suspense fallback={null}>
              <AudioDiagnosticsPanel />
            </Suspense>
          )}
        </>
      )}
      <AnimatePresence>{!started && <StartScreen key="start" onEnter={enter} busy={busy} />}</AnimatePresence>
    </div>
  )
}
