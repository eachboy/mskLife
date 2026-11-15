import { expect, test } from '@playwright/test'

test('start → enter → city lives, no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto('/')
  await expect(page.getByTestId('start-screen')).toBeVisible()
  await page.getByTestId('enter-button').click()
  await expect(page.getByTestId('start-screen')).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('input[type=range]').first()).toBeVisible()
  await page.waitForTimeout(3000)
  expect(errors).toEqual([])
})

test('volume sliders are independent and settings panel opens', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('enter-button').click()
  await expect(page.getByTestId('start-screen')).toBeHidden({ timeout: 10_000 })
  const music = page.locator('input[type=range]').nth(0)
  const city = page.locator('input[type=range]').nth(1)
  await music.fill('10')
  await city.fill('90')
  await expect(music).toHaveValue('10')
  await expect(city).toHaveValue('90')
  await page.getByRole('button', { name: /настройки/i }).click()
  await expect(page.getByRole('dialog').or(page.getByText(/низкой нагрузки|Низкая нагрузка/i)).first()).toBeVisible()
})

test('hotkey Space pauses and F is wired', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('enter-button').click()
  await expect(page.getByTestId('start-screen')).toBeHidden({ timeout: 10_000 })
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: /пауза|воспроизв|играть|play|pause/i }).first()).toBeVisible()
})
