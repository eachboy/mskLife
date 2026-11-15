// Чистый анализ PCM-сигнала (без Web Audio): используется в offline-тестах движка и в Audio Diagnostics.

export interface SignalStats {
  peak: number
  peakDb: number
  /** время пика, с (где искать самый громкий звук) */
  peakTime: number
  rms: number
  rmsDb: number
  /** сэмплы с |x| ≥ 0.999 */
  clipped: number
  /** NaN / Infinity */
  nonFinite: number
  /** резкие разрывы формы волны (щелчки/попы), см. detectClicks */
  clicks: number
  /** время первых щелчков, с — для отладки */
  clickTimes: number[]
  /** самый длинный участок тишины (< -60 dBFS RMS), с */
  maxSilence: number
  /** постоянная составляющая */
  dc: number
}

export const toDb = (v: number): number => (v > 0 ? 20 * Math.log10(v) : -Infinity)

/**
 * Детектор щелчков. Щелчок = скачок второй разности |x[n] − 2x[n−1] + x[n−2]|, который
 * намного больше её же локального фона (~5 мс до точки). Музыка с мягкими атаками и шум
 * дают ровную вторую разность и не срабатывают; обрыв синуса, мгновенный скачок гейна и
 * резкая перестройка фильтра — срабатывают.
 */
export function detectClicks(x: Float32Array, sampleRate: number, opts: { ratio?: number; floor?: number } = {}): number[] {
  const ratio = opts.ratio ?? 10
  const floor = opts.floor ?? 0.02
  const win = Math.max(8, Math.round(sampleRate * 0.005))
  const a = 1 / win
  let bg = 0
  const out: number[] = []
  let lastClick = -Infinity
  for (let n = 2; n < x.length; n++) {
    const d2 = Math.abs(x[n] - 2 * x[n - 1] + x[n - 2])
    if (n > win && d2 > floor && d2 > ratio * (bg + 1e-6) && n - lastClick > win) {
      out.push(n / sampleRate)
      lastClick = n
    }
    bg += (d2 - bg) * a
  }
  return out
}

export function signalStats(channels: Float32Array[], sampleRate: number, opts: { silenceDb?: number } = {}): SignalStats {
  const silenceLin = Math.pow(10, (opts.silenceDb ?? -60) / 20)
  let peak = 0
  let peakIdx = 0
  let sumSq = 0
  let sum = 0
  let clipped = 0
  let nonFinite = 0
  let count = 0
  const clickSet: number[] = []
  for (const x of channels) {
    for (let i = 0; i < x.length; i++) {
      const v = x[i]
      if (!Number.isFinite(v)) {
        nonFinite++
        continue
      }
      const a = Math.abs(v)
      if (a > peak) {
        peak = a
        peakIdx = i
      }
      if (a >= 0.999) clipped++
      sumSq += v * v
      sum += v
      count++
    }
    for (const t of detectClicks(x, sampleRate)) clickSet.push(t)
  }
  // тишина: окна по 50 мс, mid-канал
  const mid = channels[0]
  const win = Math.round(sampleRate * 0.05)
  let maxSilence = 0
  let run = 0
  for (let s = 0; s + win <= mid.length; s += win) {
    let e = 0
    for (let i = s; i < s + win; i++) {
      let v = 0
      for (const ch of channels) v += ch[i] || 0
      v /= channels.length
      e += v * v
    }
    if (Math.sqrt(e / win) < silenceLin) {
      run += win
      maxSilence = Math.max(maxSilence, run / sampleRate)
    } else run = 0
  }
  clickSet.sort((p, q) => p - q)
  const rms = count ? Math.sqrt(sumSq / count) : 0
  return {
    peak,
    peakDb: toDb(peak),
    peakTime: peakIdx / sampleRate,
    rms,
    rmsDb: toDb(rms),
    clipped,
    nonFinite,
    clicks: clickSet.length,
    clickTimes: clickSet.slice(0, 20),
    maxSilence,
    dc: count ? sum / count : 0,
  }
}
