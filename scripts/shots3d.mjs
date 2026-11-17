// Кадры 3D для приёмки (План §10). Dev-сервер, High, зерно выключено, время заморожено через window.__ml.
// node scripts/shots3d.mjs <имя>:<погода>:<минуты>[:<опции>] ...   → D:/dev-cache/tmp/mlgl/<имя>.png
// опции (через «,»): flash — кадр С вспышкой молнии (eventBus 'lightning', canvas.toDataURL в том же кадре);
//   cam=x/y/z/yaw/pitch — камера (м, рад; камера статична при prefers-reduced-motion); q=high|medium|low.
// Пример: node scripts/shots3d.mjs s4b-rain-day:rain:780 s4b-storm:thunderstorm:1230:flash
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const PORT = 5198
const OUT = 'D:/dev-cache/tmp/mlgl'
const shots = process.argv.slice(2).map((a) => {
  const [name, weather, minutes, opts = ''] = a.split(':')
  const o = Object.fromEntries(
    opts
      .split(',')
      .filter(Boolean)
      .map((x) => {
        const [k, v = '1'] = x.split('=')
        return [k, v]
      }),
  )
  return { name, weather, minutes: Number(minutes), o }
})
if (shots.length === 0) throw new Error('нужен хотя бы один кадр: имя:погода:минуты[:опции]')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: true })
let browser
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) break
    } catch {}
    await sleep(250)
  }
  browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  })
  for (const s of shots) {
    const q = s.o.q ?? 'high'
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: s.o.cam ? 'reduce' : 'no-preference',
    })
    await ctx.addInitScript((qq) => localStorage.setItem('ml.quality', qq), q)
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))
    await page.goto(`http://localhost:${PORT}/?perf&nograin`)
    await page.click('[data-testid=enter-button]')
    await page.waitForFunction(() => (window.__gl?.frames ?? 0) > 30, null, { timeout: 60_000 })
    await page.evaluate(([w, m]) => window.__ml?.('tverskaya', w, m), [s.weather, s.minutes])
    if (s.o.cam) {
      const [x, y, z, yaw = Math.PI, pitch = -0.06] = s.o.cam.split('/').map(Number)
      await page.evaluate(
        ([x, y, z, yaw, pitch]) => {
          const c = window.__cam3d
          c.position.set(x, y, z)
          c.rotation.set(pitch, yaw, 0, 'YXZ')
        },
        [x, y, z, yaw, pitch],
      )
    }
    await sleep(4000)
    const file = `${OUT}/${s.name}.png`
    if (s.o.flash) {
      const url = await page.evaluate(
        async () => {
          const { eventBus } = await import('/src/utils/eventBus.ts')
          eventBus.emit('lightning', { distance: 0.2 })
          return new Promise((res) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() =>
                res(document.querySelector('[data-testid=scene] canvas').toDataURL('image/png')),
              ),
            ),
          )
        },
      )
      writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'))
    } else {
      await page.screenshot({ path: file })
    }
    console.log('ok', file)
    await ctx.close()
  }
} finally {
  await browser?.close()
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}
