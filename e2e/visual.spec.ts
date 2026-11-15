import { expect, test, type Page } from '@playwright/test'

// Визуальная регрессия сцен. Эталоны: e2e/visual.spec.ts-snapshots/ (обновлять: npm run e2e:update-snapshots,
// только осознанно и с объяснением). Недетерминированное (прохожие, частицы, зерно, часы, подписи) скрыто,
// поэтому сравнивается сама иллюстрация + свет + погода.

const SCENES: [loc: string, weather: string, minutes: number][] = [
  ['gorky-park', 'clear', 12 * 60],
  ['arbat', 'light-rain', 19 * 60],
  ['tverskaya', 'clear', 23 * 60],
  ['metro-station', 'clear', 10 * 60],
  ['metro-ride', 'clear', 10 * 60],
  ['cafe', 'light-rain', 15 * 60],
  ['office', 'clear', 17.5 * 60],
  ['home', 'clear', 23 * 60],
  ['bus-ride', 'clear', 18 * 60],
  ['vdnh', 'snow', 14 * 60],
  ['zaryadye', 'thunderstorm', 20 * 60],
  ['courtyard', 'clear', 9 * 60],
]

const FREEZE_CSS = `
  [data-testid=entity], [data-testid=grain], [data-testid=caption], [data-testid=title-card],
  [data-testid=scene] canvas { visibility: hidden !important; }
  *, *::before, *::after { transition: none !important; }
`

// Текст, который меняется со временем (часы, температура, название трека, локация).
const dynamicUi = (page: Page) => [
  page.getByTestId('top-bar'),
  page.getByTestId('track-title'),
  page.getByTestId('info-block'),
  page.getByTestId('equalizer'),
]

async function enter(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByTestId('enter-button').click()
  await expect(page.getByTestId('start-screen')).toBeHidden({ timeout: 10_000 })
  await page.addStyleTag({ content: FREEZE_CSS })
}

test.describe('visual regression: scenes', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(180_000)

  test('scene matrix', async ({ page }) => {
    await enter(page)
    for (const [loc, weather, minutes] of SCENES) {
      await test.step(`${loc} · ${weather} · ${minutes / 60}h`, async () => {
        await page.evaluate(([l, w, m]) => (window as unknown as { __ml: (...a: unknown[]) => void }).__ml(l, w, m), [loc, weather, minutes] as const)
        await expect(page.getByTestId('curtain')).toHaveAttribute('data-active', 'false', { timeout: 5_000 })
        await page.waitForTimeout(2_500) // лерп погоды/света
        await expect(page.getByTestId('scene')).toHaveScreenshot(`${loc}-${weather}.png`, {
          animations: 'disabled',
          mask: dynamicUi(page),
          maxDiffPixelRatio: 0.02,
        })
      })
    }
  })
})

test.describe('visual regression: responsive UI', () => {
  for (const vp of [
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`ui ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await enter(page)
      await page.evaluate(() => (window as unknown as { __ml: (...a: unknown[]) => void }).__ml('arbat', 'clear', 12 * 60))
      await expect(page.getByTestId('curtain')).toHaveAttribute('data-active', 'false', { timeout: 5_000 })
      await page.waitForTimeout(2_500)
      await expect(page).toHaveScreenshot(`ui-${vp.name}.png`, {
        animations: 'disabled',
        mask: dynamicUi(page),
        maxDiffPixelRatio: 0.02,
      })
    })
  }
})
