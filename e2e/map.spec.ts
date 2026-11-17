import { expect, type Page, test } from '@playwright/test'

async function enter(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto('/')
  await page.getByTestId('enter-button').click()
  await expect(page.getByTestId('start-screen')).toBeHidden({ timeout: 10_000 })
  return errors
}

test('мини-радар → полная карта → Esc/кнопка/клавиша M, без ошибок', async ({ page }) => {
  const errors = await enter(page)
  await expect(page.getByTestId('map-radar')).toBeVisible()
  await page.getByTestId('map-radar').click()
  await expect(page.getByTestId('city-map')).toBeVisible()
  await expect(page.getByTestId('map-radar')).toBeHidden()
  await expect(page.getByTestId('pin-arbat')).toBeVisible()
  await expect(page.getByTestId('hero-beacon')).toBeAttached()

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('city-map')).toBeHidden({ timeout: 3000 })

  await page.keyboard.press('KeyM')
  await expect(page.getByTestId('city-map')).toBeVisible()
  await page.getByTestId('map-back').click()
  await expect(page.getByTestId('city-map')).toBeHidden({ timeout: 3000 })

  await page.getByTestId('btn-map').click()
  await expect(page.getByTestId('city-map')).toBeVisible()
  await page.getByTestId('btn-map').click()
  await expect(page.getByTestId('city-map')).toBeHidden({ timeout: 3000 })
  expect(errors).toEqual([])
})

test('пин → карточка; «Отправить героя сюда» строит маршрут; «Перейти в сцену» делает наезд', async ({ page }) => {
  const errors = await enter(page)
  await page.keyboard.press('KeyM')
  await page.getByTestId('pin-vdnh').click()
  await expect(page.getByTestId('map-card')).toBeVisible()
  await expect(page.getByTestId('map-card-title')).toHaveText('ВДНХ')
  // герой не на ВДНХ → переход в сцену недоступен, отправка — доступна
  await expect(page.getByTestId('map-dive')).toBeDisabled()
  await page.getByTestId('map-send').click()
  await expect(page.getByTestId('map-card')).toBeHidden()
  await expect(page.getByTestId('map-route-chip')).toContainText('ВДНХ')
  await expect.poll(async () => page.getByTestId('route-leg').count()).toBeGreaterThan(0)

  // карточка героя: наезд в сцену
  await page.getByTestId('hero-beacon').getByRole('button').click({ force: true })
  await expect(page.getByTestId('map-card-title')).toHaveText('Герой')
  await page.getByTestId('map-dive').click()
  await expect(page.getByTestId('city-map')).toBeHidden({ timeout: 5000 })
  await expect(page.getByTestId('scene')).toBeVisible()
  expect(errors).toEqual([])
})

test('колесо масштабирует в пределах 0.75…2.2, перетаскивание двигает карту', async ({ page }) => {
  await enter(page)
  await page.keyboard.press('KeyM')
  const plane = page.getByTestId('map-plane')
  const zoom = () =>
    plane.evaluate((el) => Number.parseFloat((el as HTMLElement).style.getPropertyValue('--map-zoom') || '1'))
  const pan = () => plane.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--map-pan-x'))
  const view = page.getByTestId('city-map-view')
  const box = (await view.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -300)
  await expect.poll(zoom).toBeCloseTo(2.2, 1)
  for (let i = 0; i < 16; i++) await page.mouse.wheel(0, 300)
  await expect.poll(zoom).toBeCloseTo(0.75, 1)
  const before = await pan()
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 6 })
  await page.mouse.up()
  expect(await pan()).not.toBe(before)
})
