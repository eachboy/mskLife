import { AnimatePresence, motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { LOCATIONS, SELECTABLE_LOCATIONS } from '../../data/locations'
import { WEATHER_KINDS, WEATHER_PRESETS } from '../../features/weather/weatherData'
import { weatherManager } from '../../features/weather/WeatherManager'
import { MODE_LABELS } from '../../simulation/scenarios/activities'
import { scenarioEngine } from '../../simulation/engine/ScenarioEngine'
import { useAudioStore, VIZ_MODES } from '../../stores/audioStore'
import { useWorldStore } from '../../stores/worldStore'
import { VIZ_LABELS } from '../player/Visualizer'
import { Slider } from '../ui/Slider'
import type { ScenarioMode } from '../../types'
import type { PanelId } from './BottomBar'

function Shell({ title, onClose, children, id }: { title: string; onClose: () => void; children: ReactNode; id: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="glass scrollbar-thin pointer-events-auto max-h-[62vh] w-full overflow-y-auto rounded-3xl p-4 md:p-5"
      role="dialog"
      aria-label={title}
      data-testid={`panel-${id}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xs uppercase tracking-[0.3em] text-[#ffd6b0]">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Закрыть" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10"><X size={16} /></button>
      </div>
      {children}
    </motion.div>
  )
}

const MODE_EMOJI: Record<ScenarioMode, string> = { random: '🎲', free: '🌿', work: '💼', rainy: '☔', winter: '❄️', night: '🌃' }

function ScenarioPanel({ close }: { close: () => void }) {
  const mode = useWorldStore((s) => s.scenarioMode)
  return (
    <Shell title="Сценарий дня" id="scenario" onClose={close}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(MODE_LABELS) as ScenarioMode[]).map((m) => (
          <button
            key={m} type="button" onClick={() => { scenarioEngine.reset(m); close() }}
            className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition hover:bg-white/10 ${mode === m ? 'border-[#ffb27a]/60 bg-[#ffb27a]/10' : 'border-white/10'}`}
            data-testid={`mode-${m}`}
          >
            <span className="text-2xl" aria-hidden>{MODE_EMOJI[m]}</span>
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold">{MODE_LABELS[m].label}{mode === m && <Check size={14} className="text-[#ffb27a]" />}</span>
              <span className="mt-0.5 block text-xs text-[#fff3e2]/60">{MODE_LABELS[m].blurb}</span>
            </span>
          </button>
        ))}
      </div>
    </Shell>
  )
}

const GROUPS: { title: string; kinds: string[] }[] = [
  { title: 'Парки', kinds: ['park'] },
  { title: 'Улицы и районы', kinds: ['street'] },
  { title: 'Места', kinds: ['cafe', 'office', 'courtyard'] },
]

function LocationPanel({ close }: { close: () => void }) {
  const current = useWorldStore((s) => s.location)
  return (
    <Shell title="Куда отправимся?" id="location" onClose={close}>
      <p className="mb-3 text-xs text-[#fff3e2]/55">Персонаж доберётся пешком, на автобусе или метро — без телепортации.</p>
      {GROUPS.map((g) => (
        <div key={g.title} className="mb-3">
          <div className="mb-1.5 text-[11px] uppercase tracking-widest text-[#fff3e2]/45">{g.title}</div>
          <div className="flex flex-wrap gap-2">
            {SELECTABLE_LOCATIONS.filter((l) => g.kinds.includes(l.kind)).map((l) => (
              <button
                key={l.id} type="button" onClick={() => { scenarioEngine.goTo(l.id); close() }} title={l.blurb}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition hover:bg-white/12 ${current === l.id ? 'border-[#ffb27a]/70 bg-[#ffb27a]/15' : 'border-white/12'}`}
                data-testid={`loc-${l.id}`}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Shell>
  )
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-4 rounded-2xl px-3 py-2 text-left hover:bg-white/5">
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-[#fff3e2]/50">{hint}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-[#ffb27a]' : 'bg-white/20'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

function SettingsPanel({ close }: { close: () => void }) {
  const s = useWorldStore()
  const master = useAudioStore((a) => a.masterVolume)
  const setMaster = useAudioStore((a) => a.setMasterVolume)
  const viz = useAudioStore((a) => a.vizMode)
  const setViz = useAudioStore((a) => a.setVizMode)
  return (
    <Shell title="Настройки" id="settings" onClose={close}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-widest text-[#fff3e2]/45">Мир</div>
          <Toggle on={s.weatherSource === 'real'} onChange={(v) => weatherManager.setSource(v ? 'real' : 'simulation')} label="Реальная погода Москвы" hint="Open-Meteo; при ошибке — симуляция" />
          <Toggle on={s.clockMode === 'real'} onChange={(v) => s.patch({ clockMode: v ? 'real' : 'accelerated' })} label="Реальное время суток" hint="Свет следует за настоящими часами Москвы" />
          <Toggle on={s.lowPerf} onChange={(v) => s.patch({ lowPerf: v })} label="Экономичный режим" hint="Меньше частиц и людей — для слабых устройств" />
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-widest text-[#fff3e2]/45">Погода вручную</div>
          <div className="flex flex-wrap gap-1.5">
            {WEATHER_KINDS.map((k) => (
              <button
                key={k} type="button" onClick={() => { weatherManager.setSource('simulation'); weatherManager.force(k) }}
                className={`rounded-full border px-3 py-1 text-xs transition hover:bg-white/12 ${s.weatherKind === k ? 'border-[#ffb27a]/70 bg-[#ffb27a]/15' : 'border-white/12'}`}
                data-testid={`weather-${k}`}
              >
                {WEATHER_PRESETS[k].label}
              </button>
            ))}
          </div>
          <div className="mb-1 mt-4 text-[11px] uppercase tracking-widest text-[#fff3e2]/45">Звук</div>
          <div className="flex items-center gap-3 px-3 py-1 text-sm">
            <span className="w-32 shrink-0 whitespace-nowrap" aria-hidden>Общая громкость</span>
            <Slider value={master} onChange={setMaster} label="Общая громкость" className="block" />
            <span className="w-8 text-right text-xs tabular-nums text-[#fff3e2]/55" data-testid="master-value">{Math.round(master * 100)}</span>
          </div>
          <fieldset className="m-0 flex flex-wrap items-center gap-1.5 border-0 px-3 py-1">
            <legend className="sr-only">Визуализатор</legend>
            <span className="w-32 shrink-0 text-sm" aria-hidden>Визуализатор</span>
            {VIZ_MODES.map((m) => (
              <button
                key={m} type="button" aria-pressed={viz === m} onClick={() => setViz(m)}
                className={`rounded-full border px-3 py-1 text-xs transition hover:bg-white/12 ${viz === m ? 'border-[#ffb27a]/70 bg-[#ffb27a]/15' : 'border-white/12'}`}
                data-testid={`viz-${m}`}
              >
                {VIZ_LABELS[m]}
              </button>
            ))}
          </fieldset>
          <div className="mt-3 text-[11px] text-[#fff3e2]/40">Горячие клавиши: Пробел — музыка, F — полный экран</div>
        </div>
      </div>
    </Shell>
  )
}

export function PanelHost({ panel, setPanel }: { panel: PanelId; setPanel: (p: PanelId) => void }) {
  const close = () => setPanel(null)
  void LOCATIONS
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[132px] z-30 flex justify-center px-2 md:bottom-[100px] md:px-4">
      <div className="w-full max-w-[1000px]">
        <AnimatePresence mode="wait">
          {panel === 'scenario' && <ScenarioPanel key="s" close={close} />}
          {panel === 'location' && <LocationPanel key="l" close={close} />}
          {panel === 'settings' && <SettingsPanel key="t" close={close} />}
        </AnimatePresence>
      </div>
    </div>
  )
}
