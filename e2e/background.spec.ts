import { expect, type Page, test } from '@playwright/test'

/** Фоновый режим: заголовок/медиасессия, «вид сверху» для звука карты, Zen Mode, скрытая вкладка. */

type Audio = {
  mixer: {
    debugNodes: () => Record<
      'cityLp' | 'weatherLp' | 'cityTrim' | 'weatherTrim',
      { frequency?: { value: number }; gain?: { value: number } }
    >
  }
}

async function enter(page: Page) {
  await page.goto('/?audiodebug')
  await page.getByTestId('enter-button').click()
  await page.waitForFunction(
    () =>
      (
        window as unknown as { __audio?: { manager: { diagnostics: () => { contextState: string } | null } } }
      ).__audio?.manager.diagnostics()?.contextState === 'running',
    null,
    { timeout: 30_000 },
  )
}

const cut = (page: Page) =>
  page.evaluate(() => {
    const n = (window as unknown as { __audio: Audio }).__audio.mixer.debugNodes()
    return {
      city: n.cityLp.frequency?.value ?? 0,
      weather: n.weatherLp.frequency?.value ?? 0,
      trim: n.cityTrim.gain?.value ?? 0,
    }
  })

test('заголовок вкладки и медиасессия отражают локацию и погоду', async ({ page }) => {
  await enter(page)
  await expect.poll(() => page.title()).toMatch(/^♪ .+ • .+ — mskLife$/)
  const meta = await page.evaluate(() => {
    const m = navigator.mediaSession.metadata
    return m ? { artist: m.artist, album: m.album } : null
  })
  expect(meta?.album).toBe('mskLife — 2.5D Moscow Companion')
  expect(meta?.artist).toContain('•')
})

test('карта открыта → город и погода глуше (650 Гц, −4 дБ), в локации — снова 18 кГц', async ({ page }) => {
  await enter(page)
  expect((await cut(page)).city).toBeGreaterThan(15000)
  await page.keyboard.press('KeyM')
  await expect.poll(async () => (await cut(page)).city, { timeout: 8000 }).toBeLessThan(900)
  const open = await cut(page)
  expect(open.weather).toBeLessThan(900)
  expect(open.trim).toBeLessThan(0.7)
  await page.keyboard.press('KeyM')
  await expect.poll(async () => (await cut(page)).city, { timeout: 8000 }).toBeGreaterThan(15000)
})

test('Zen Mode: через 12 с UI прячется, движение мыши возвращает; панель блокирует', async ({ page }) => {
  await enter(page)
  const root = page.locator('html')
  await page.waitForTimeout(12_600)
  await expect(root).toHaveAttribute('data-zen', '1')
  await expect(page.getByTestId('bottom-bar')).toHaveCSS('opacity', '0')
  await page.mouse.move(300, 300)
  await expect(root).not.toHaveAttribute('data-zen', '1')
  await expect(page.getByTestId('bottom-bar')).toHaveCSS('opacity', '1')
})

test('скрытая вкладка: атрибут data-page-hidden, звук продолжает идти', async ({ page }) => {
  await enter(page)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.locator('html')).toHaveAttribute('data-page-hidden', '1')
  const st = await page.evaluate(
    () =>
      (
        window as unknown as { __audio: { manager: { diagnostics: () => { contextState: string } } } }
      ).__audio.manager.diagnostics().contextState,
  )
  expect(st).toBe('running')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.locator('html')).toHaveAttribute('data-page-hidden', '0')
})
