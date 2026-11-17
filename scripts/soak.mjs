// Soak-тест MOSCOW LIFE в реальном времени на изолированной production-сборке.
//   node scripts/soak.mjs [minutes=32] [--build] [--port 5195] [--out D:/dev-cache/tmp/soak] [--cpu 4] [--headed] [--interval 30]
// Каждые N секунд: ctx.state/currentTime (монотонность, дрейф к стенным часам), __audio.manager.diagnostics(),
// RMS/пик/клип мастера (непрерывный опрос анализатора 32768 без дыр), heap до/после GC (CDP), DOM/CDP-узлы,
// слушатели, сущности, long tasks / LoAF, FPS. Отчёт перезаписывается после каждого замера: SOAK_REPORT.md + samples.jsonl.
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const argv = process.argv.slice(2)
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d)
const MIN = Number(argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? 32)
const PORT = Number(opt('--port', 5195))
const OUT = opt('--out', 'D:/dev-cache/tmp/soak')
const DIST = opt('--dist', 'D:/dev-cache/tmp/mlsoak')
const CPU = Number(opt('--cpu', 1))
const INTERVAL = Number(opt('--interval', 30))
const HEADED = argv.includes('--headed')
const isWin = process.platform === 'win32'
mkdirSync(OUT, { recursive: true })

if (argv.includes('--build')) {
  const r = spawnSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], { shell: isWin, stdio: 'inherit' })
  if (r.status !== 0) process.exit(1)
}

let srv = null
if (!argv.includes('--no-server')) {
  srv = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { shell: isWin, stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 3500))
}
const killSrv = () => {
  if (!srv) return
  if (isWin) spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'])
  else srv.kill()
  srv = null
}

const browser = await chromium.launch({
  headless: !HEADED,
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const cdp = await page.context().newCDPSession(page)
await cdp.send('Performance.enable')
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })

const errors = []
page.on('pageerror', (e) => errors.push({ t: Date.now(), m: `pageerror: ${e.message}` }))
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push({ t: Date.now(), m: `${m.type()}: ${m.text()}` }))

await page.goto(`http://localhost:${PORT}/?audiodebug&perf`)
await page.click('[data-testid=enter-button]')
await page.waitForFunction(() => window.__audio?.manager.diagnostics()?.contextState === 'running', null, { timeout: 30000 })

// инструментирование страницы: FPS, long tasks, LoAF, непрерывный мастер-метр
await page.evaluate(() => {
  const P = { frames: 0, minFps: Infinity, lt: [], loaf: [], sec: { n: 0, t: performance.now() } }
  window.__soak = P
  const raf = (t) => {
    P.frames++
    P.sec.n++
    if (t - P.sec.t >= 1000) {
      const f = (P.sec.n * 1000) / (t - P.sec.t)
      if (f < P.minFps) P.minFps = f
      P.sec = { n: 0, t }
    }
    requestAnimationFrame(raf)
  }
  requestAnimationFrame(raf)
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) P.lt.push(e.duration)
  }).observe({ type: 'longtask', buffered: true })
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) P.loaf.push(e.blockingDuration ?? 0)
    }).observe({ type: 'long-animation-frame', buffered: true })
  } catch {}
  // мастер: свой анализатор 32768 (≈0.68 с при 48 кГц) от выхода мастер-анализатора, опрос раз в 0.4 с → без пропусков
  const { manager, T } = window.__audio
  const raw = T.getContext().rawContext
  const src = manager.analyser('master')
  const a = raw.createAnalyser()
  a.fftSize = 32768
  src.connect(a)
  const buf = new Float32Array(a.fftSize)
  const M = { peak: 0, sq: 0, n: 0, clip: 0, nan: 0, silentPolls: 0, polls: 0 }
  P.meter = M
  P.ctxSeen = new Set()
  setInterval(() => {
    a.getFloatTimeDomainData(buf)
    let pk = 0
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i]
      if (!Number.isFinite(v)) {
        M.nan++
        continue
      }
      const av = v < 0 ? -v : v
      if (av > pk) pk = av
      if (av >= 0.999) M.clip++
      M.sq += v * v
    }
    M.n += buf.length
    M.polls++
    if (pk < 1e-4) M.silentPolls++
    if (pk > M.peak) M.peak = pk
  }, 400)
})

const takeAndReset = () =>
  page.evaluate(() => {
    const P = window.__soak
    const { manager, T } = window.__audio
    const raw = T.getContext().rawContext
    const M = P.meter
    const db = (x) => (x > 0 ? Math.round(20 * Math.log10(x) * 10) / 10 : -200)
    const out = {
      wall: performance.now(),
      ctxState: raw.state,
      ctxTime: raw.currentTime,
      transport: T.getTransport().seconds,
      diag: manager.diagnostics(),
      frames: P.frames,
      minFps: P.minFps === Infinity ? 0 : Math.round(P.minFps),
      lt: { n: P.lt.length, max: Math.round(Math.max(0, ...P.lt)), sum: Math.round(P.lt.reduce((a, b) => a + b, 0)) },
      loaf: { n: P.loaf.length, maxBlock: Math.round(Math.max(0, ...P.loaf)) },
      master: { rmsDb: db(Math.sqrt(M.sq / Math.max(1, M.n))), peakDb: db(M.peak), clip: M.clip, nan: M.nan, silentPolls: M.silentPolls, polls: M.polls },
      dom: document.getElementsByTagName('*').length,
      entities: document.querySelectorAll('[data-testid=entity]').length,
      canvases: document.getElementsByTagName('canvas').length,
      heapPreGC: performance.memory?.usedJSHeapSize ?? 0,
      hidden: document.hidden,
      track: document.querySelector('[data-testid=track-title]')?.textContent ?? null,
    }
    P.frames = 0
    P.minFps = Infinity
    P.lt = []
    P.loaf = []
    Object.assign(M, { peak: 0, sq: 0, n: 0, clip: 0, nan: 0, silentPolls: 0, polls: 0 })
    return out
  })

const world = () =>
  page.evaluate(() => {
    const t = document.querySelector('[data-testid=clock]')?.textContent ?? ''
    const loc = document.querySelector('[data-location]')?.getAttribute('data-location') ?? ''
    return { clock: t.trim(), loc }
  })

const metrics = async (gc) => {
  if (gc) await cdp.send('HeapProfiler.collectGarbage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]))
  return { heapPostGC: m.JSHeapUsedSize, heapTotal: m.JSHeapTotalSize, cdpNodes: m.Nodes, listeners: m.JSEventListeners, documents: m.Documents, frames: m.Frames }
}

const samples = []
const MB = (b) => Math.round((b / 1048576) * 10) / 10
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}
const slope = (pts) => {
  // МНК: единицы y в минуту
  const n = pts.length
  if (n < 3) return 0
  const mx = pts.reduce((a, p) => a + p[0], 0) / n
  const my = pts.reduce((a, p) => a + p[1], 0) / n
  let num = 0
  let den = 0
  for (const [x, y] of pts) {
    num += (x - mx) * (y - my)
    den += (x - mx) ** 2
  }
  return den ? num / den : 0
}

function writeReport(final) {
  const s0 = samples[0]
  const sN = samples.at(-1)
  const warm = samples.filter((s) => s.min >= 3)
  const head = warm.slice(0, 10)
  const tail = warm.slice(-10)
  const series = (k) => warm.map((s) => [s.min, typeof k === 'function' ? k(s) : s[k]])
  const trend = (label, k, unit, fmt = (x) => x, limitPct = 10) => {
    const h = median(head.map((s) => (typeof k === 'function' ? k(s) : s[k])))
    const t = median(tail.map((s) => (typeof k === 'function' ? k(s) : s[k])))
    const sl = slope(series(k))
    const pct = h ? ((t - h) / h) * 100 : 0
    const verdict = warm.length < 20 ? 'мало данных' : pct > limitPct ? 'РОСТ (провал)' : pct < -limitPct ? 'снижение' : 'плато'
    return `| ${label} | ${fmt(s0 ? (typeof k === 'function' ? k(s0) : s0[k]) : 0)} | ${fmt(h)} | ${fmt(t)} | ${fmt(sN ? (typeof k === 'function' ? k(sN) : sN[k]) : 0)} | ${pct.toFixed(1)} % | ${fmt(Math.round(sl * 1000) / 1000)}${unit}/мин | ${verdict} |`
  }
  const allLt = samples.reduce((a, s) => a + s.lt.n, 0)
  const maxLt = Math.max(0, ...samples.map((s) => s.lt.max))
  const lateTotal = sN ? sN.diag?.music.lateSteps : 0
  const droppedTotal = sN ? sN.diag?.music.droppedNotes : 0
  const clipTotal = samples.reduce((a, s) => a + s.master.clip, 0)
  const nanTotal = samples.reduce((a, s) => a + s.master.nan, 0)
  const nonMono = samples.filter((s) => s.dCtx !== undefined && s.dCtx <= 0).length
  const maxDrift = Math.max(0, ...samples.map((s) => Math.abs(s.drift ?? 0)))
  const transportJumps = samples.filter((s) => s.dTransport !== undefined && (s.dTransport < 0 || Math.abs(s.dTransport - s.dWall) > 1.5)).length
  const lines = [
    `# SOAK REPORT — MOSCOW LIFE`,
    '',
    `${final ? 'Завершён' : 'В процессе'}: ${new Date().toISOString()} · длительность ${sN ? sN.min.toFixed(1) : 0} мин из ${MIN} · интервал ${INTERVAL} с · CPU throttling ${CPU}x · ${HEADED ? 'headed' : 'headless'} Chromium (GPU-флаги как в qa-report) · сборка ${DIST} · http://localhost:${PORT}/?audiodebug&perf`,
    '',
    'Сценарий: естественный ход симуляции (ScenarioEngine + WeatherManager), без __ml (в prod-сборке нет dev-хуков); вкладка видима всё время. Heap «после GC» — CDP HeapProfiler.collectGarbage перед каждым замером. Тренд: медиана первых 10 замеров после 3-й минуты против последних 10 + МНК-наклон; рост > 10 % = провал.',
    '',
    '## Тренды',
    '',
    '| Метрика | t0 | начало (медиана) | конец (медиана) | последний | Δ | наклон | вердикт |',
    '|---|---|---|---|---|---|---|---|',
    trend('JS heap после GC, МБ', (s) => MB(s.heapPostGC), ' МБ'),
    trend('JS heap до GC, МБ', (s) => MB(s.heapPreGC), ' МБ', (x) => x, 25),
    trend('DOM-элементы', 'dom', ''),
    trend('CDP Nodes (вкл. detached)', 'cdpNodes', ''),
    trend('JS event listeners', 'listeners', ''),
    trend('Аудиоузлы (music+weather+city)', (s) => (s.diag ? s.diag.nodes.music + s.diag.nodes.weather + s.diag.nodes.city : 0), ''),
    trend('Живые сущности', 'entities', '', (x) => x, 1000),
    trend('FPS (средний)', 'fps', '', (x) => x, 1000),
    '',
    '## Звук и планировщик',
    '',
    `- ctx.state не running: ${samples.filter((s) => s.ctxState !== 'running').length} замеров; instances (сессий движка): ${sN?.diag?.instances ?? '?'}`,
    `- currentTime: немонотонных интервалов ${nonMono}; макс. |Δctx − Δwall| ${maxDrift.toFixed(3)} с; скачков Transport (назад или |Δ−Δwall|>1.5 с) ${transportJumps}`,
    `- lateSteps всего ${lateTotal}, из них ${gcLate} внесены принудительным GC стенда, собственных ${Math.max(0, lateTotal - gcLate)} (порог 0); droppedNotes ${droppedTotal}, skippedHits ${sN?.diag?.music.skippedHits ?? '?'}; мастер: clip-сэмплов ${clipTotal}, NaN ${nanTotal}; опросов с тишиной ${samples.reduce((a, s) => a + s.master.silentPolls, 0)} из ${samples.reduce((a, s) => a + s.master.polls, 0)}`,
    `- long tasks всего ${allLt}, макс ${maxLt} мс; LoAF с blocking > 0: ${samples.reduce((a, s) => a + s.loaf.n, 0)}`,
    `- Ошибки/предупреждения консоли: ${errors.length}${errors.length ? '\n' + errors.slice(0, 20).map((e) => `  - ${e.m.slice(0, 300)}`).join('\n') : ''}`,
    '',
    '## Замеры',
    '',
    '| мин | ctx | ctxTime | Δctx−Δwall | heap до/после GC МБ | DOM | CDP nodes | listeners | ent | аудиоузлы m/w/c | voices | late | drop | RMS/пик дБ | clip | FPS ср/мин | LT n/max | часы · локация |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...samples.map(
      (s) =>
        `| ${s.min.toFixed(1)} | ${s.ctxState} | ${s.ctxTime.toFixed(1)} | ${(s.drift ?? 0).toFixed(3)} | ${MB(s.heapPreGC)}/${MB(s.heapPostGC)} | ${s.dom} | ${s.cdpNodes} | ${s.listeners} | ${s.entities} | ${s.diag ? `${s.diag.nodes.music}/${s.diag.nodes.weather}/${s.diag.nodes.city}` : '-'} | ${s.diag?.music.activeVoices ?? '-'} | ${s.diag?.music.lateSteps ?? '-'} | ${s.diag?.music.droppedNotes ?? '-'} | ${s.master.rmsDb}/${s.master.peakDb} | ${s.master.clip} | ${s.fps}/${s.minFps} | ${s.lt.n}/${s.lt.max} | ${s.world.clock} ${s.world.loc} |`,
    ),
    '',
  ]
  writeFileSync(`${OUT}/SOAK_REPORT.md`, lines.join('\n'))
}

writeFileSync(`${OUT}/samples.jsonl`, '')
const t0 = Date.now()
let prev = null
let stop = false
let gcLate = 0
process.on('SIGINT', () => (stop = true))
try {
  while (!stop) {
    const r = await takeAndReset()
    const m = await metrics(true)
    // Принудительный GC через CDP останавливает главный поток на 0.1–0.6 с (long task observer этого не видит)
    // и съедает lookAhead планировщика (0.3 с) → опоздавшие шаги вносит сам стенд. Считаем их отдельно.
    await new Promise((res) => setTimeout(res, 700))
    const lateAfterGc = await page.evaluate(() => window.__audio.manager.diagnostics()?.music.lateSteps ?? 0)
    gcLate += Math.max(0, lateAfterGc - (r.diag?.music.lateSteps ?? lateAfterGc))
    const w = await world()
    const min = (Date.now() - t0) / 60000
    const s = { min, ...r, ...m, world: w }
    if (prev) {
      s.dWall = (r.wall - prev.wall) / 1000
      s.dCtx = r.ctxTime - prev.ctxTime
      s.drift = s.dCtx - s.dWall
      s.dTransport = r.transport - prev.transport
      s.fps = Math.round((r.frames / s.dWall) * 10) / 10
    } else s.fps = 0
    samples.push(s)
    appendFileSync(`${OUT}/samples.jsonl`, `${JSON.stringify(s)}\n`)
    writeReport(false)
    console.log(
      `[soak] ${min.toFixed(1)}m ctx=${r.ctxState} heap=${MB(m.heapPostGC)}MB dom=${r.dom} nodes=${m.cdpNodes} ent=${r.entities} fps=${s.fps} lt=${r.lt.n}/${r.lt.max} late=${r.diag?.music.lateSteps} rms=${r.master.rmsDb}`,
    )
    prev = r
    if (min >= MIN) break
    await new Promise((res) => setTimeout(res, INTERVAL * 1000))
  }
} catch (e) {
  errors.push({ t: Date.now(), m: `soak-script: ${e?.stack ?? e}` })
  console.error(e)
} finally {
  writeReport(true)
  await browser.close().catch(() => {})
  killSrv()
}
