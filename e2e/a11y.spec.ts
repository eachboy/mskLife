import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Accessibility (axe-core, WCAG 2.1 A/AA). Падает на critical/serious; moderate/minor — в аннотациях отчёта.
// Иллюстрация сцены декоративна (aria-hidden), проверяется UI поверх неё.

async function audit(page: Page, label: string) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const blocking = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  for (const v of res.violations) {
    test.info().annotations.push({
      type: `a11y:${v.impact}`,
      description: `[${label}] ${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`,
    })
  }
  expect(blocking.map((v) => `${v.id} (${v.impact}): ${v.help} × ${v.nodes.length}`), `${label}: critical/serious нарушения`).toEqual([])
}

test('a11y: start screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('start-screen')).toBeVisible()
  await audit(page, 'start')
})

test('a11y: main view and panels', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('enter-button').click()
  await expect(page.getByTestId('start-screen')).toBeHidden({ timeout: 10_000 })
  await page.waitForTimeout(1500)
  await audit(page, 'main')
  await page.getByRole('button', { name: /настройки/i }).click()
  await page.waitForTimeout(400)
  await audit(page, 'settings')
})

test('a11y: keyboard reaches controls', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  const first = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName)
  expect(first, 'первый Tab фокусирует кнопку входа').toBe('enter-button')
})
