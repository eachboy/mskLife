import { expect, type Page, test } from '@playwright/test'

/**
 * Звук: offline-метрики движка, второй экземпляр, фон, повторный старт, визуализатор.
 * Это автоматические замеры — «прослушано» они не заменяют.
 */

type Lab = { renderOffline: (s: Record<string, unknown>) => Promise<Record<string, number>> }
type Diag = { contextState: string; transportState: string; instances: number; music: { lateSteps: number }; nodes: { travel: number } }
type AudioWin = { __audio?: { manager: { diagnostics: () => Diag | null; start: () => Promise<void>; setTestSignal: (k: string | null) => void } }; __audioLab?: Lab }

const amb = { traffic: 0.6, crowd: 0.5, birds: 0, water: 0, metro: 0, cafe: 0, office: 0, wind: 0, indoor: 0 }

test.describe('offline engine', () => {
  test('full mix: no clicks, clipping, NaN; second instance is audible', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/audio-lab.html')
    await page.waitForFunction(() => (window as unknown as AudioWin).__audioLab)
    const sc = { seconds: 8, seed: 4242, music: true, city: amb, weather: { rain: 0.5, cloud: 0.8 }, minutes: 14 * 60 }
    const run = () => page.evaluate((s) => (window as unknown as AudioWin).__audioLab!.renderOffline(s), sc)
    const a = await run()
    expect(a.nonFinite).toBe(0)
    expect(a.clipped).toBe(0)
    expect(a.clicks).toBe(0)
    expect(a.peakDb).toBeLessThan(-3)
    expect(a.lateSteps).toBe(0)
    expect(a.droppedNotes).toBe(0)
    // регресс «второй экземпляр молчит» (движки были привязаны к глобальному контексту)
    const b = await run()
    expect(b.rmsDb).toBeGreaterThan(-45)
    expect(Math.abs(b.rmsDb - a.rmsDb)).toBeLessThan(1)
  })
})

test.describe('offline travel-sound', () => {
  test('metro trip phases: no clicks/clipping/NaN, node count stable, outputs released after silence', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/audio-lab.html')
    await page.waitForFunction(() => (window as unknown as AudioWin).__audioLab)
    const st = { ...amb, metro: 0.9, crowd: 0.5, traffic: 0, indoor: 0.8 }
    const wagon = { ...amb, metro: 1, crowd: 0.3, traffic: 0, indoor: 0.9 }
    const ph = (at: number, phase: string, duration: number, sounds: string[] = [], indoor = true) => ({ at, phase, duration, sounds, indoor })
    const travel = [
      { at: 0, ambience: st },
      ph(0, 'metro-turnstile', 1, ['turnstile']),
      ph(1, 'metro-train-arrival', 1.5, ['train-arrive', 'doors-open']),
      { at: 2.35, transition: 'begin' },
      { at: 3, ambience: wagon, transition: 'end' },
      ph(3, 'metro-departure', 1, ['doors-close', 'train-depart']),
      ph(4, 'metro-ride', 2, ['tunnel']),
      ph(6, 'metro-arriving', 1, ['station-announcement', 'train-brake']),
      { at: 6.35, transition: 'begin' },
      { at: 7, ambience: st, transition: 'end' },
      ph(7, 'metro-alighting', 1, ['doors-open']),
      ph(8, 'activity', 10, []),
    ]
    const r = await page.evaluate((s) => (window as unknown as AudioWin).__audioLab!.renderOffline(s), { seconds: 16, music: false, travel })
    expect(r.nonFinite).toBe(0)
    expect(r.clipped).toBe(0)
    expect(r.clicks).toBe(0)
    expect(r.peakDb).toBeLessThan(-6)
    expect(r.rmsDb).toBeGreaterThan(-50)
    expect(r.nodesEnd).toBe(r.nodesStart)
    expect(r.travelPhases).toBe(7)
    expect(r.travelActiveEnd).toBe(0)
  })
})

async function enter(page: Page, query = '') {
  await page.goto(`/${query}`)
  await page.getByTestId('enter-button').click()
  await page.waitForFunction(() => (window as unknown as AudioWin).__audio?.manager.diagnostics()?.contextState === 'running', null, { timeout: 20_000 })
}
const diag = (page: Page) => page.evaluate(() => (window as unknown as AudioWin).__audio!.manager.diagnostics()!)
const level = async (page: Page) => Number(await page.getByTestId('equalizer').getAttribute('data-level'))

test.describe('realtime lifecycle', () => {
  test('hidden tab keeps context running; repeated start makes no duplicate', async ({ page }) => {
    await enter(page)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(1500)
    const d = await diag(page)
    expect(d.contextState).toBe('running')
    expect(d.transportState).toBe('started')
    // travel-движок поднят вместе с остальными (узлы созданы один раз)
    expect(d.nodes.travel).toBeGreaterThan(0)

    await page.evaluate(async () => {
      const m = (window as unknown as AudioWin).__audio!.manager
      await Promise.all([m.start(), m.start(), m.start()])
    })
    expect((await diag(page)).instances).toBe(1)
  })

  test('visualizer follows the real signal: test tone, volume 0, silence', async ({ page }) => {
    await enter(page)
    // музыку на паузу, город/погоду — в ноль: остаётся только тестовый сигнал
    await page.getByTestId('play-toggle').click()
    for (const name of ['Город', 'Погода']) {
      const btn = page.getByRole('button', { name: `Выключить: ${name}` }).first()
      if (await btn.isVisible()) await btn.click()
    }
    await expect.poll(() => level(page), { timeout: 10_000 }).toBeLessThan(0.15)

    await page.evaluate(() => (window as unknown as AudioWin).__audio!.manager.setTestSignal('sine-1k'))
    await expect.poll(() => level(page), { timeout: 5_000 }).toBeGreaterThan(0.5)

    // общая громкость 0 → визуализатор (после мастер-гейна) гаснет
    await page.getByTestId('btn-settings').click()
    await page.getByRole('slider', { name: 'Общая громкость' }).fill('0')
    await expect.poll(() => level(page), { timeout: 5_000 }).toBeLessThan(0.15)
    await page.getByRole('slider', { name: 'Общая громкость' }).fill('90')
    await expect.poll(() => level(page), { timeout: 5_000 }).toBeGreaterThan(0.5)

    await page.evaluate(() => (window as unknown as AudioWin).__audio!.manager.setTestSignal(null))
    await expect.poll(() => level(page), { timeout: 5_000 }).toBeLessThan(0.15)

    // режимы переключаются кликом по визуализатору
    const viz = page.getByTestId('equalizer')
    const before = await viz.getAttribute('data-mode')
    await viz.click()
    expect(await viz.getAttribute('data-mode')).not.toBe(before)
  })

  test('diagnostics panel shows context and buses', async ({ page }) => {
    await enter(page, '?audiodiag')
    await expect(page.getByTestId('audiodiag')).toBeVisible()
    await expect(page.getByTestId('diag-ctx')).toContainText('running')
    await expect(page.getByTestId('diag-instances')).toHaveText('1')
    await expect(page.getByTestId('diag-bus-master')).toBeVisible()
  })
})
