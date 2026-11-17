import { useEffect, useRef } from 'react'
import { audioLifecycle } from '../../audio/core/AudioLifecycleManager'
import { useAudioStore, VIZ_MODES, type VizMode } from '../../stores/audioStore'
import { useWorldStore } from '../../stores/worldStore'
import { isPageHidden, onPageVisibility } from '../../utils/pageVisibility'

/**
 * Визуализатор реального сигнала: читает AnalyserNode мастер-шины (после soft-clip и громкости),
 * поэтому отражает именно то, что слышно: тишина → плоско, громкость 0 → плоско, тестовый синус → один пик.
 * Рисует в canvas раз в кадр (30 fps, 15 в экономичном режиме), React не ререндерит.
 * В скрытой вкладке rAF не вызывается — нагрузки нет, звук это не затрагивает.
 */

const W = 64
const H = 18
const MIN_DB = -90
const MAX_DB = -22
const LABELS: Record<VizMode, string> = { bars: 'столбики', spectrum: 'спектр', wave: 'осциллограмма', off: 'выключен' }

/** Лог-полосы частот [lo, hi) в Гц. */
export function logBands(n: number, lo = 50, hi = 12000): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const r = Math.log(hi / lo)
  for (let i = 0; i < n; i++) out.push([lo * Math.exp((r * i) / n), lo * Math.exp((r * (i + 1)) / n)])
  return out
}

/** Средний уровень полос (0..1) из спектра в dB. Пустые/бесконечные значения = тишина. */
export function bandLevels(
  db: Float32Array,
  sampleRate: number,
  bands: Array<[number, number]>,
  out: Float32Array = new Float32Array(bands.length),
  bins: Int32Array = bandBins(db.length, sampleRate, bands),
): Float32Array {
  for (let k = 0; k < bands.length; k++) {
    const a = bins[k * 2]
    const b = bins[k * 2 + 1]
    let m = -Infinity
    for (let i = a; i < b; i++) if (db[i] > m) m = db[i]
    out[k] = Number.isFinite(m) ? Math.min(1, Math.max(0, (m - MIN_DB) / (MAX_DB - MIN_DB))) : 0
  }
  return out
}

/** Границы полос в бинах [a, b) подряд: a0,b0,a1,b1… Считаются один раз на анализатор. */
export function bandBins(binCount: number, sampleRate: number, bands: Array<[number, number]>): Int32Array {
  const binHz = sampleRate / 2 / binCount
  const res = new Int32Array(bands.length * 2)
  for (let k = 0; k < bands.length; k++) {
    const a = Math.max(1, Math.floor(bands[k][0] / binHz))
    res[k * 2] = a
    res[k * 2 + 1] = Math.max(a + 1, Math.min(binCount, Math.ceil(bands[k][1] / binHz)))
  }
  return res
}

export function Visualizer() {
  const mode = useAudioStore((s) => s.vizMode)
  const setVizMode = useAudioStore((s) => s.setVizMode)
  const lowPerf = useWorldStore((s) => s.lowPerf)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rootRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    const root = rootRef.current
    if (!cv || !root || mode === 'off') return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = W * dpr
    cv.height = H * dpr
    const g = cv.getContext('2d')
    if (!g) return
    g.scale(dpr, dpr)
    const n = mode === 'bars' ? 6 : 28
    const bands = logBands(n)
    const smooth = new Float32Array(n)
    const lv = new Float32Array(n)
    let bins: Int32Array | null = null
    let freq: Float32Array<ArrayBuffer> | null = null
    let time: Float32Array<ArrayBuffer> | null = null
    let an: AnalyserNode | null = null
    const frameMs = 1000 / (lowPerf ? 15 : 30)
    let last = 0
    let lastAttr = 0
    let raf = 0

    const draw = (now: number) => {
      raf = isPageHidden() ? 0 : requestAnimationFrame(draw)
      if (now - last < frameMs) return
      last = now
      const a = audioLifecycle.analyser('master')
      if (a !== an) {
        an = a
        freq = a ? new Float32Array(a.frequencyBinCount) : null
        time = a ? new Float32Array(a.fftSize) : null
        bins = a ? bandBins(a.frequencyBinCount, a.context.sampleRate, bands) : null
      }
      g.clearRect(0, 0, W, H)
      g.fillStyle = '#ffb27a'
      g.strokeStyle = '#ffb27a'
      let level = 0
      if (mode === 'wave') {
        let peak = 0
        if (an && time) an.getFloatTimeDomainData(time)
        g.lineWidth = 1.5
        g.beginPath()
        const step = time ? Math.floor(time.length / W) : 1
        for (let x = 0; x <= W; x++) {
          const v = time ? time[Math.min(time.length - 1, x * step)] || 0 : 0
          peak = Math.max(peak, Math.abs(v))
          const y = H / 2 - Math.max(-1, Math.min(1, v * 2.2)) * (H / 2 - 1)
          if (x === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        g.stroke()
        level = Math.min(1, peak * 2.2)
      } else {
        // Chrome при полностью тихом входе (gain 0) не обновляет спектр и отдаёт последний кадр,
        // хотя форма волны уже нулевая, — поэтому тишину определяем по форме волны.
        let live = false
        if (an && time) {
          an.getFloatTimeDomainData(time)
          for (let i = 0; i < time.length; i += 4)
            if (Math.abs(time[i]) > 1e-4) {
              live = true
              break
            }
        }
        if (live && an && freq) an.getFloatFrequencyData(freq)
        if (live && an && freq && bins) bandLevels(freq, an.context.sampleRate, bands, lv, bins)
        else lv.fill(0)
        for (let i = 0; i < n; i++) {
          // быстрая атака, плавный спад — не дёргается, но реагирует на удары
          smooth[i] = lv[i] > smooth[i] ? lv[i] : smooth[i] * 0.82 + lv[i] * 0.18
          level = Math.max(level, smooth[i])
        }
        if (mode === 'bars') {
          const bw = 3
          const gap = (W - n * bw) / (n - 1)
          for (let i = 0; i < n; i++) {
            const h = Math.max(2, smooth[i] * H)
            const x = i * (bw + gap)
            g.beginPath()
            g.roundRect(x, H - h, bw, h, 1.5)
            g.fill()
          }
        } else {
          g.globalAlpha = 0.85
          g.beginPath()
          g.moveTo(0, H)
          for (let i = 0; i < n; i++) g.lineTo((i / (n - 1)) * W, H - Math.max(1, smooth[i] * H))
          g.lineTo(W, H)
          g.closePath()
          g.fill()
          g.globalAlpha = 1
        }
      }
      // атрибут уровня — для e2e (реакция на тестовый сигнал / громкость / тишину), 4 раза в секунду
      if (now - lastAttr > 250) {
        lastAttr = now
        root.dataset.level = level.toFixed(2)
      }
    }
    // скрытая вкладка: цикл полностью останавливается (0 GPU), при возврате — сразу же возобновляется
    const offVis = onPageVisibility((hidden) => {
      if (hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!raf) raf = requestAnimationFrame(draw)
    })
    if (!isPageHidden()) raf = requestAnimationFrame(draw)
    return () => {
      offVis()
      cancelAnimationFrame(raf)
      raf = 0
    }
  }, [mode, lowPerf])

  if (mode === 'off') return null
  const next = VIZ_MODES[(VIZ_MODES.indexOf(mode) + 1) % (VIZ_MODES.length - 1)]
  return (
    <button
      ref={rootRef}
      type="button"
      onClick={() => setVizMode(next)}
      className="grid h-[18px] w-16 shrink-0 place-items-center rounded opacity-90 hover:opacity-100"
      aria-label={`Визуализатор: ${LABELS[mode]}. Переключить на: ${LABELS[next]}`}
      title={`Визуализатор: ${LABELS[mode]}`}
      data-testid="equalizer"
      data-mode={mode}
      data-level="0"
    >
      <canvas ref={canvasRef} style={{ width: W, height: H }} aria-hidden />
    </button>
  )
}

export const VIZ_LABELS = LABELS
