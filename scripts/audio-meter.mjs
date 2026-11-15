// Диагностика уровней аудио: node scripts/audio-meter.mjs [seconds] [url]
// Подключает AnalyserNode к узлам цепочки (dev-хук window.__audio) и пишет пики/клиппинг/подавление компрессора.
import { chromium } from '@playwright/test'

const secs = Number(process.argv[2] ?? 30)
const url = process.argv[3] ?? 'http://localhost:5173'
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage()
const logs = []
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(m.type() + ': ' + m.text()))
await page.goto(url)
await page.click('[data-testid=enter-button]')
await page.waitForFunction(() => window.__audio, null, { timeout: 15000 })

const result = await page.evaluate(async (secs) => {
  const { T, mixer, music } = window.__audio
  const ctx = T.getContext().rawContext
  const taps = { ...music.debug, ...mixer.debugNodes() }
  const stats = {}
  const analysers = {}
  for (const [name, node] of Object.entries(taps)) {
    // раздельно L/R: даунмикс в анализаторе прячет противофазные пики
    const split = ctx.createChannelSplitter(2)
    T.connect(node, split)
    for (const ch of [0, 1]) {
      const a = ctx.createAnalyser()
      a.fftSize = 32768
      split.connect(a, ch)
      analysers[name + (ch ? '.R' : '.L')] = a
      stats[name + (ch ? '.R' : '.L')] = { peak: 0, over1: 0, over09: 0, rmsSum: 0, n: 0, jumps: 0, nan: 0 }
    }
  }
  const buf = new Float32Array(32768)
  let maxRed = { comp: 0, lim: 0 }
  const limSamples = []
  const t0 = performance.now()
  while (performance.now() - t0 < secs * 1000) {
    for (const [name, a] of Object.entries(analysers)) {
      a.getFloatTimeDomainData(buf)
      const s = stats[name]
      let sq = 0
      for (let i = 0; i < buf.length; i++) {
        if (!Number.isFinite(buf[i])) { s.nan++; continue }
        const v = Math.abs(buf[i])
        if (v > s.peak) s.peak = v
        if (v > 1) s.over1++
        if (v > 0.9) s.over09++
        if (i && Math.abs(buf[i] - buf[i - 1]) > 0.2) s.jumps++
        sq += buf[i] * buf[i]
      }
      s.rmsSum += Math.sqrt(sq / buf.length) || 0
      s.n++
    }
    maxRed.comp = Math.min(maxRed.comp, mixer.debugNodes().comp.reduction)
    maxRed.lim = Math.min(maxRed.lim, (mixer.debugNodes().limiter.reduction ?? 0))
    limSamples.push(Math.round((mixer.debugNodes().limiter.reduction ?? 0)))
    await new Promise((r) => setTimeout(r, 200))
  }
  const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf')
  const out = {}
  for (const [k, s] of Object.entries(stats)) out[k] = `peak ${db(s.peak)} dB, rms ${db(s.rmsSum / s.n)} dB, >1: ${s.over1}, >0.9: ${s.over09}, jumps>0.2: ${s.jumps}, nan: ${s.nan}`
  const hist = {}; for (const v of limSamples) hist[v] = (hist[v] ?? 0) + 1
  return { out, maxRed, limHist: hist, state: ctx.state, sr: ctx.sampleRate, base: ctx.baseLatency }
}, secs)
console.log(JSON.stringify(result, null, 1))
console.log('console:', logs.slice(0, 15))
await browser.close()
