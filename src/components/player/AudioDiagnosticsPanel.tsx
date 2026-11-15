import { useEffect, useRef, useState } from 'react'
import { type AudioDiagnostics, audioLifecycle, type TestSignal } from '../../audio/core/AudioLifecycleManager'
import type { BusId } from '../../audio/engine/AudioMixer'
import { MUSIC_LAYERS, type MusicLayer } from '../../audio/engine/MusicEngine'

/**
 * Audio Diagnostics (открывается по ?audiodiag): уровни шин по AnalyserNode, клиппинг, состояние контекста,
 * планировщик, узлы, solo-слои и тестовые сигналы. Только чтение + управление диагностическими режимами —
 * обычный звук не меняет, пока не включены solo / тестовый сигнал.
 */

const BUSES: BusId[] = ['music', 'city', 'weather', 'preLimiter', 'master']
const SIGNALS: Array<[TestSignal | null, string]> = [
  [null, 'выкл'], ['sine-220', '220 Гц'], ['sine-440', '440 Гц'], ['sine-1k', '1 кГц'], ['sweep', 'свип'], ['pink', 'розовый шум'],
]

interface BusMeter { rmsDb: number; peakDb: number; clips: number }

const db = (v: number) => (v > 1e-6 ? 20 * Math.log10(v) : -Infinity)
const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '−∞')

export default function AudioDiagnosticsPanel() {
  const [diag, setDiag] = useState<AudioDiagnostics | null>(null)
  const [meters, setMeters] = useState<Record<string, BusMeter>>({})
  const [open, setOpen] = useState(true)
  const clipCount = useRef<Record<string, number>>({})
  const buf = useRef<Float32Array<ArrayBuffer> | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => {
      setDiag(audioLifecycle.diagnostics())
      const next: Record<string, BusMeter> = {}
      for (const b of BUSES) {
        const an = audioLifecycle.analyser(b)
        if (!an) continue
        if (!buf.current || buf.current.length < an.fftSize) buf.current = new Float32Array(an.fftSize)
        const x = buf.current.subarray(0, an.fftSize)
        an.getFloatTimeDomainData(x)
        let sum = 0
        let peak = 0
        let clips = 0
        for (let i = 0; i < x.length; i++) {
          const a = Math.abs(x[i])
          sum += x[i] * x[i]
          if (a > peak) peak = a
          if (a >= 0.999) clips++
        }
        clipCount.current[b] = (clipCount.current[b] ?? 0) + clips
        next[b] = { rmsDb: db(Math.sqrt(sum / x.length)), peakDb: db(peak), clips: clipCount.current[b] }
      }
      setMeters(next)
    }, 250)
    return () => clearInterval(id)
  }, [])

  const solo = diag?.solo ?? null
  const toggleSolo = (l: MusicLayer) => {
    const cur = new Set(solo ?? [])
    if (cur.has(l)) cur.delete(l)
    else cur.add(l)
    audioLifecycle.setSolo(cur.size ? [...cur] : null)
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="glass absolute left-2 top-24 z-40 rounded-full px-3 py-1 text-xs" data-testid="audiodiag-open">
        Диагностика звука
      </button>
    )
  }

  return (
    <section className="glass absolute left-2 top-24 z-40 w-[320px] max-w-[calc(100vw-16px)] rounded-2xl p-3 text-[11px] leading-snug" aria-label="Диагностика звука" data-testid="audiodiag">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider">Диагностика звука</h2>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-2 hover:bg-white/10" aria-label="Свернуть диагностику">×</button>
      </div>
      {!diag ? (
        <p className="text-[#fff3e2]/60">Звук ещё не запущен — нажмите «Войти».</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-3 tabular-nums">
            <dt>Контекст</dt><dd data-testid="diag-ctx">{diag.contextState} · {diag.sampleRate} Гц</dd>
            <dt>Транспорт</dt><dd>{diag.transportState}</dd>
            <dt>Задержка</dt><dd>{(diag.baseLatency * 1000).toFixed(1)} мс</dd>
            <dt>Экземпляров</dt><dd data-testid="diag-instances">{diag.instances}</dd>
            <dt>Тиков / опозданий</dt><dd>{diag.music.ticks} / {diag.music.lateSteps}</dd>
            <dt>Отброшено нот</dt><dd>{diag.music.droppedNotes}</dd>
            <dt>Голосов</dt><dd>{diag.music.activeVoices}</dd>
            <dt>Узлов м/г/п</dt><dd>{diag.nodes.music} / {diag.nodes.city} / {diag.nodes.weather}</dd>
            {diag.lastRecovery && (<><dt>Восстановление</dt><dd className="truncate" title={diag.lastRecovery}>{diag.lastRecovery}</dd></>)}
          </dl>
          <table className="mt-2 w-full tabular-nums">
            <thead className="text-[#fff3e2]/50"><tr><th className="text-left font-normal">Шина</th><th className="font-normal">RMS дБ</th><th className="font-normal">пик дБ</th><th className="font-normal">клип</th></tr></thead>
            <tbody>
              {BUSES.map((b) => (
                <tr key={b} data-testid={`diag-bus-${b}`}>
                  <td>{b}</td>
                  <td className="text-center">{fmt(meters[b]?.rmsDb ?? -Infinity)}</td>
                  <td className="text-center">{fmt(meters[b]?.peakDb ?? -Infinity)}</td>
                  <td className={`text-center ${meters[b]?.clips ? 'text-[#ff9a9a]' : ''}`}>{meters[b]?.clips ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-[#fff3e2]/50">Solo слоёв музыки</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {MUSIC_LAYERS.map((l) => (
              <button key={l} type="button" aria-pressed={!!solo?.includes(l)} onClick={() => toggleSolo(l)} className={`rounded-full border px-2 py-0.5 ${solo?.includes(l) ? 'border-[#ffb27a]/70 bg-[#ffb27a]/15' : 'border-white/12'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[#fff3e2]/50">Тестовый сигнал (в музыкальную шину)</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {SIGNALS.map(([k, label]) => (
              <button key={label} type="button" aria-pressed={diag.testSignal === k} onClick={() => audioLifecycle.setTestSignal(k)} className={`rounded-full border px-2 py-0.5 ${diag.testSignal === k ? 'border-[#ffb27a]/70 bg-[#ffb27a]/15' : 'border-white/12'}`} data-testid={`diag-sig-${k ?? 'off'}`}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { clipCount.current = {} }} className="mt-2 rounded-full border border-white/12 px-2 py-0.5">Сбросить счётчики клипа</button>
        </>
      )}
    </section>
  )
}
