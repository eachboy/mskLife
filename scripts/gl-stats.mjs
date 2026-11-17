// Замер 3D-рендера на production-сборке: FPS, draw calls, треугольники, ресурсы, число WebGL-контекстов.
// node scripts/gl-stats.mjs [--build] [--quality high|medium|low] [--secs 20] [--shot file.png] [--minutes 540 [--weather clear] --dev]
// --minutes: время суток для кадра через window.__ml (только dev-сервер → нужен --dev; цифры FPS при --dev не приёмочные).
// Бюджеты — docs/CINEMATIC_3D_PLAN.md §9. Прогоны запускать по одному: параллельный браузер искажает FPS.
import { spawn, spawnSync } from 'node:child_process'
import { chromium } from '@playwright/test'

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? true) : def
}
const quality = arg('quality', 'high')
const secs = Number(arg('secs', 20))
const shot = arg('shot', '')
const minutes = arg('minutes', '')
const weather = arg('weather', 'clear')
const dev = process.argv.includes('--dev')
const PORT = 5197
const OUT = 'D:/dev-cache/tmp/mlgl'
const BUDGET = {
  high: { fps: 50, calls: 300, tris: 1_500_000 },
  medium: { fps: 55, calls: 220, tris: 800_000 },
  low: { fps: 30, calls: 120, tris: 300_000 },
}[quality]
if (!BUDGET) throw new Error(`--quality: high | medium | low, получено ${quality}`)

if (process.argv.includes('--build') && !dev) {
  const r = spawnSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir'], { stdio: 'inherit', shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
const server = spawn('npx', dev ? ['vite', '--port', String(PORT), '--strictPort'] : ['vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  shell: true,
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]

let browser
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) break
    } catch {}
    await sleep(250)
  }
  browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  })
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript((q) => {
    localStorage.setItem('ml.quality', q)
    // счётчик WebGL-контекстов: бюджет — ровно один
    window.__glContexts = 0
    const orig = HTMLCanvasElement.prototype.getContext
    const seen = new WeakSet()
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const c = orig.call(this, type, ...rest)
      if (c && /webgl/.test(type) && !seen.has(this)) {
        seen.add(this)
        window.__glContexts++
      }
      return c
    }
  }, quality)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' || /WebGL|THREE/.test(m.text())) errors.push(`${m.type()}: ${m.text()}`)
  })
  await page.goto(`http://localhost:${PORT}/?perf&nograin`)
  await page.click('[data-testid=enter-button]')
  await page.waitForFunction(() => (window.__gl?.frames ?? 0) > 30, null, { timeout: 30_000 })
  if (minutes !== '') await page.evaluate(([w, m]) => window.__ml?.('tverskaya', w, m), [weather, Number(minutes)])
  await sleep(3000) // прогрев: компиляция шейдеров, первые тени

  const fps = []
  const calls = []
  const tris = []
  let last = await page.evaluate(() => ({ ...window.__gl, t: performance.now() }))
  for (let i = 0; i < secs; i++) {
    await sleep(1000)
    const cur = await page.evaluate(() => ({ ...window.__gl, t: performance.now() }))
    fps.push(((cur.frames - last.frames) * 1000) / (cur.t - last.t))
    calls.push(cur.calls)
    tris.push(cur.triangles)
    last = cur
  }
  const info = await page.evaluate(() => {
    const c = document.querySelector('[data-testid=scene] canvas')
    const gl = c?.getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return {
      contexts: window.__glContexts,
      canvas: c ? `${c.width}×${c.height}` : 'нет',
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'неизвестно',
      render: "3d",
    }
  })
  if (shot) await page.screenshot({ path: shot })

  const row = (name, fact, limit, ok) => console.log(`| ${name} | ${fact} | ${limit} | ${ok ? 'ОК' : 'ПРОВАЛ'} |`)
  const f = median(fps)
  console.log(
    `\nКачество: ${quality} · ${secs} с · буфер ${info.canvas} · режим ${info.render}\nGPU: ${info.renderer}\n`,
  )
  console.log('| Метрика | Факт | Порог | Статус |\n|---|---|---|---|')
  row(
    'FPS, медиана (мин…макс)',
    `${f.toFixed(1)} (${Math.min(...fps).toFixed(1)}…${Math.max(...fps).toFixed(1)})`,
    `≥ ${BUDGET.fps}`,
    f >= BUDGET.fps,
  )
  row('Draw calls', Math.max(...calls), `≤ ${BUDGET.calls}`, Math.max(...calls) <= BUDGET.calls)
  row('Треугольники', Math.max(...tris), `≤ ${BUDGET.tris}`, Math.max(...tris) <= BUDGET.tris)
  row('WebGL-контекстов', info.contexts, '1', info.contexts === 1)
  row('Ошибки консоли', errors.length, '0', errors.length === 0)
  console.log(`\nРесурсы: геометрий ${last.geometries}, текстур ${last.textures}, программ ${last.programs}`)
  for (const e of errors.slice(0, 10)) console.log(`  ${e}`)
} finally {
  await browser?.close()
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}
