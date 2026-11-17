import { expect, test, type Page } from '@playwright/test'

// Визуальный контроль UI поверх 3D-кадра. Эталонов в репозитории нет: первый прогон создаёт их
// (e2e/visual3d.spec.ts-snapshots/), обновлять — npm run e2e:update-snapshots, только после вердикта
// visual-art-director. Допуск 0.02 — сглаживание и драйвер GPU дают шум. Время/локация/погода заморожены
// через window.__ml, зерно выключено (?nograin).

const dynamicUi = (page: Page) => [
  page.getByTestId('top-bar'),
  page.getByTestId('track-title'),
  page.getByTestId('info-block'),
  page.getByTestId('equalizer'),
]

async function enter(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?nograin')
  await page.getByTestId('enter-button').click()
  await expect(page.getByTestId('start-screen')).toBeHidden({ timeout: 10_000 })
  await page.addStyleTag({ content: '[data-testid=caption], [data-testid=title-card] { visibility: hidden !important; } *, *::before, *::after { transition: none !important; }' })
}

test.describe('visual 3D: UI over the 3D frame', () => {
  test.setTimeout(120_000)

  for (const vp of [
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`ui ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await enter(page)
      await page.evaluate(() => (window as unknown as { __ml: (...a: unknown[]) => void }).__ml('arbat', 'clear', 12 * 60))
      await expect(page.getByTestId('curtain')).toHaveAttribute('data-active', 'false', { timeout: 10_000 })

      // рендер только 3D: ровно один canvas сцены (визуализатор плеера aria-hidden — не считается), сцена-SVG отсутствует
      await expect(page.locator('canvas:not([aria-hidden])')).toHaveCount(1)
      await expect(page.locator('[data-testid=scene] svg')).toHaveCount(0)
      await expect(page.locator('[data-testid=entity]')).toHaveCount(0)

      await page.waitForTimeout(3_000) // лерп света/погоды и догрузка тайлов
      await expect(page).toHaveScreenshot(`ui3d-${vp.name}.png`, {
        animations: 'disabled',
        mask: [...dynamicUi(page), page.locator('canvas:not([aria-hidden])')], // кадр 3D непрерывно анимируется (камера), поэтому маскируется
        maxDiffPixelRatio: 0.02,
        timeout: 30_000, // программный WebGL в headless нагружает главный поток
      })
    })
  }
})
