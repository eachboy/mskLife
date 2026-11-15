import {
  Building2, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudMoon, CloudSun, Compass, Maximize2, Minimize2, Moon, Pause, Play, Settings, Snowflake, Sun,
  Volume2, VolumeX, Wind, Workflow, type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { WEATHER_PRESETS } from '../../features/weather/weatherData'
import { getLighting, lightingMonth } from '../../features/city/lighting'
import { useAudioStore } from '../../stores/audioStore'
import { useWorldStore } from '../../stores/worldStore'
import { fmtTime } from '../../utils/math'
import { IconButton } from '../ui/IconButton'
import { Slider } from '../ui/Slider'
import { Visualizer } from '../player/Visualizer'

const ICONS: Record<string, LucideIcon> = {
  sun: Sun, 'cloud-sun': CloudSun, cloud: Cloud, 'cloud-drizzle': CloudDrizzle, 'cloud-rain': CloudRain,
  'cloud-lightning': CloudLightning, snowflake: Snowflake, 'cloud-snow': CloudSnow, 'cloud-fog': CloudFog, wind: Wind,
}

export type PanelId = 'scenario' | 'location' | 'settings' | null

export function BottomBar({ panel, setPanel, onToggleFullscreen, fullscreen }: {
  panel: PanelId
  setPanel: (p: PanelId) => void
  onToggleFullscreen: () => void
  fullscreen: boolean
}) {
  const a = useAudioStore()
  const minutes = useWorldStore((s) => Math.floor(s.minutes))
  const weatherKind = useWorldStore((s) => s.weatherKind)
  const temperature = useWorldStore((s) => s.temperature)
  const dayCount = useWorldStore((s) => s.dayCount)
  const [mix, setMix] = useState(false)
  const preset = WEATHER_PRESETS[weatherKind]
  const season = useWorldStore((s) => s.season)
  // ночью вместо солнца — луна (по длине дня сезона)
  const isNight = getLighting(minutes, preset.params, season, lightingMonth(season)).night > 0.6
  const WIcon = isNight && preset.icon === 'sun' ? Moon : isNight && preset.icon === 'cloud-sun' ? CloudMoon : ICONS[preset.icon] ?? Cloud
  const playing = a.musicPlaying && a.engineState === 'running'

  const [date, setDate] = useState('')
  useEffect(() => {
    const upd = () => setDate(new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' }).format(new Date()))
    upd()
    const id = setInterval(upd, 60000)
    return () => clearInterval(id)
  }, [])

  const toggle = (p: Exclude<PanelId, null>) => setPanel(panel === p ? null : p)

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 md:px-4 md:pb-4" data-testid="bottom-bar">
      <div className="glass w-full max-w-[1280px] rounded-[26px] px-3 py-2 md:px-4">
        {/* мобильный микшер */}
        {mix && (
          <div className="mb-2 grid grid-cols-1 gap-2 border-b border-white/10 pb-3 xl:hidden">
            <MixRow icon={<Volume2 size={16} />} label="Музыка" value={a.musicVolume} onChange={a.setMusicVolume} />
            <MixRow icon={<Building2 size={16} />} label="Город" value={a.cityVolume} onChange={a.setCityVolume} muted={a.cityMuted} onMute={a.toggleCityMuted} />
            <MixRow icon={<CloudRain size={16} />} label="Погода" value={a.weatherVolume} onChange={a.setWeatherVolume} muted={a.weatherMuted} onMute={a.toggleWeatherMuted} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:flex-nowrap md:gap-x-5">
          {/* музыка */}
          <div className="flex min-w-0 flex-1 items-center gap-3 xl:flex-none xl:basis-[330px]">
            <IconButton size="lg" label={playing ? 'Пауза' : 'Играть'} onClick={() => a.setMusicPlaying(!a.musicPlaying)} className="bg-[#ffb27a] !text-[#2a1a3a] hover:!bg-[#ffc79c]" data-testid="play-toggle">
              {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
            </IconButton>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <Visualizer />
                <div className="h-[18px] min-w-0 flex-1 truncate whitespace-nowrap text-[13px] font-semibold leading-[18px]" data-testid="track-title" title={a.track?.title}>
                  {a.engineState === 'error' ? 'Звук недоступен' : a.track?.title ?? 'Настраиваем виниловый проигрыватель…'}
                </div>
              </div>
              <div className="mt-0.5 h-[15px] truncate whitespace-nowrap text-[11px] leading-[15px] text-[#fff3e2]/55">
                {a.track ? `${a.track.mood} · ${a.track.key}` : 'генеративный lofi'}
              </div>
            </div>
          </div>

          {/* микшер (десктоп) */}
          <div className="hidden items-center gap-5 xl:flex xl:flex-1">
            <MixRow compact icon={<Volume2 size={16} />} label="Музыка" value={a.musicVolume} onChange={a.setMusicVolume} />
            <MixRow compact icon={<Building2 size={16} />} label="Город" value={a.cityVolume} onChange={a.setCityVolume} muted={a.cityMuted} onMute={a.toggleCityMuted} />
            <MixRow compact icon={<CloudRain size={16} />} label="Погода" value={a.weatherVolume} onChange={a.setWeatherVolume} muted={a.weatherMuted} onMute={a.toggleWeatherMuted} />
          </div>

          {/* информация */}
          <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-1.5" data-testid="info-block">
            <WIcon size={22} className="text-[#ffd6b0]" aria-hidden />
            <div className="leading-tight">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-lg font-medium tabular-nums" data-testid="clock">{fmtTime(minutes)}</span>
                <span className="text-sm text-[#ffd6b0]" data-testid="temperature">{temperature > 0 ? '+' : ''}{temperature}°</span>
              </div>
              <div className="text-[11px] text-[#fff3e2]/60">
                <span data-testid="weather-label">{preset.label}</span>
                <span className="hidden whitespace-nowrap sm:inline"> · {date}{dayCount > 0 ? ` · день ${dayCount + 1}` : ''}</span>
              </div>
            </div>
          </div>

          {/* кнопки */}
          <div className="flex items-center gap-0.5">
            <IconButton className="xl:!hidden" label="Микшер" active={mix} onClick={() => setMix((v) => !v)}><Volume2 size={18} /></IconButton>
            <IconButton label="Сценарий дня" active={panel === 'scenario'} onClick={() => toggle('scenario')} data-testid="btn-scenario"><Workflow size={18} /></IconButton>
            <IconButton label="Сменить локацию" active={panel === 'location'} onClick={() => toggle('location')} data-testid="btn-location"><Compass size={18} /></IconButton>
            <IconButton label="Настройки" active={panel === 'settings'} onClick={() => toggle('settings')} data-testid="btn-settings"><Settings size={18} /></IconButton>
            <IconButton label={fullscreen ? 'Выйти из полноэкранного режима' : 'Полный экран'} onClick={onToggleFullscreen} data-testid="btn-fullscreen">
              {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function MixRow({ icon, label, value, onChange, muted, onMute, compact }: {
  icon: React.ReactNode
  label: string
  value: number
  onChange: (v: number) => void
  muted?: boolean
  onMute?: () => void
  compact?: boolean
}) {
  return (
    <div className={`flex items-end gap-2 ${compact ? 'min-w-0 flex-1 basis-0' : ''}`} data-testid={`mix-${label}`}>
      {onMute ? (
        <button type="button" onClick={onMute} aria-label={muted ? `Включить: ${label}` : `Выключить: ${label}`} aria-pressed={muted} title={muted ? `Включить: ${label}` : `Выключить: ${label}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#fff3e2]/85 hover:bg-white/10">
          {muted ? <VolumeX size={16} className="text-[#ff9a9a]" /> : icon}
        </button>
      ) : (
        <span className="grid h-7 w-7 shrink-0 place-items-center text-[#fff3e2]/85">{icon}</span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-[9px]">
        <span className="flex h-3 items-center justify-between text-[11px] font-semibold uppercase leading-none tracking-wider text-[#fff3e2]/85">
          <span>{label}</span>
          <span className="tabular-nums font-medium text-[#fff3e2]/45">{Math.round((muted ? 0 : value) * 100)}</span>
        </span>
        <Slider value={muted ? 0 : value} onChange={onChange} label={`Громкость: ${label}`} disabled={muted} className="block" />
      </div>
    </div>
  )
}
