// Скриншоты сцен для визуальной проверки: node scripts/shots.mjs [url] [outDir]
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const url = process.argv[2] ?? 'http://localhost:5173'
const out = process.argv[3] ?? 'D:/dev-cache/tmp/shots'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + ' ' + String(e.stack).split(String.fromCharCode(10)).slice(0, 4).join(' | ')))

await page.goto(url)
await page.waitForTimeout(1200)
await page.screenshot({ path: `${out}/00-start.png` })
await page.click('[data-testid=enter-button]')
await page.waitForTimeout(5000)
await page.screenshot({ path: `${out}/01-park.png` })

// принудительно меняем локации/время/погоду через window-хук стора (dev)
const shots = [
  ['arbat', 'clear', 12 * 60],
  ['tverskaya', 'light-rain', 19 * 60],
  ['metro-station', 'clear', 10 * 60],
  ['metro-ride', 'clear', 10 * 60],
  ['cafe', 'light-rain', 15 * 60],
  ['office', 'clear', 17.5 * 60],
  ['home', 'clear', 23 * 60],
  ['bus-ride', 'clear', 18 * 60],
  ['vdnh', 'snow', 14 * 60],
  ['moscow-city', 'clear', 21.5 * 60],
  ['courtyard', 'clear', 9 * 60],
  ['zaryadye', 'thunderstorm', 20 * 60],
]
for (const [loc, weather, minutes] of shots) {
  await page.evaluate(([loc, weather, minutes]) => window.__ml?.(loc, weather, minutes), [loc, weather, minutes])
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${out}/${loc}-${weather}.png` })
}
console.log('errors:', errors.length ? errors : 'none')
await browser.close()
