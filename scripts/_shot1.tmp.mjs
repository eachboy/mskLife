// node shot1.mjs loc weather minutes out [w h] [wait]
import { chromium } from '@playwright/test'
const [loc, weather, minutes, out, w = '1600', h = '900', wait = '3500', seek = ''] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: +w, height: +h } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto('http://localhost:5173')
await page.click('[data-testid=enter-button]')
await page.waitForTimeout(1500)
await page.evaluate(([l, w, m]) => window.__ml?.(l, w, +m), [loc, weather, minutes])
await page.waitForTimeout(+wait)
if (seek) { await page.evaluate((t) => document.getAnimations().forEach((a) => { const d = a.effect?.getTiming?.().duration; if (d === 64000) { a.pause(); a.currentTime = t } }), +seek); await page.waitForTimeout(300) }
await page.screenshot({ path: out })
const nodes = await page.evaluate(() => document.querySelectorAll('[data-testid=scene] *').length)
console.log('nodes', nodes, 'errors', errors.slice(0, 5))
await browser.close()
