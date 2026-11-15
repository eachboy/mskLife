import { expect, test, type Page } from '@playwright/test'

function track(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push('PAGEERR ' + e.message + '\n' + (e.stack ?? '').split('\n').slice(0, 6).join('\n')))
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.type() + ' ' + m.text()))
  return errors
}
async function enter(page: Page) {
  await page.goto('/')
  await page.getByTestId('enter-button').click()
  await expect(page.getByTestId('start-screen')).toBeHidden({ timeout: 10_000 })
}

test('all panels, modes, weathers, locations, buttons', async ({ page }) => {
  test.setTimeout(240_000)
  const errors = track(page)
  await enter(page)
  const note: string[] = []
  // play toggle
  const play = page.getByTestId('play-toggle')
  note.push('play label0=' + (await play.getAttribute('aria-label')))
  await play.click(); await page.waitForTimeout(300)
  note.push('after click=' + (await play.getAttribute('aria-label')))
  await play.click(); await page.waitForTimeout(500)
  note.push('after click2=' + (await play.getAttribute('aria-label')))
  // mute buttons
  for (const n of [/Выключить: Город/, /Выключить: Погода/]) {
    await page.getByRole('button', { name: n }).click()
    await page.waitForTimeout(200)
  }
  await page.getByRole('button', { name: /Включить: Город/ }).click()
  await page.getByRole('button', { name: /Включить: Погода/ }).click()
  // sliders
  const r = page.locator('input[type=range]')
  note.push('sliders=' + (await r.count()))
  for (let i = 0; i < 3; i++) { await r.nth(i).fill('0'); await r.nth(i).fill('100'); await r.nth(i).fill('37') }
  // scenarios
  for (const m of ['random', 'free', 'work', 'rainy', 'winter', 'night']) {
    await page.getByTestId('btn-scenario').click()
    await page.getByTestId('mode-' + m).click()
    await page.waitForTimeout(1500)
    note.push(`mode ${m}: loc/clock=` + (await page.getByTestId('clock').innerText()) + ' ' + (await page.getByTestId('weather-label').innerText()))
  }
  // weather
  await page.getByTestId('btn-settings').click()
  const wk = await page.locator('[data-testid^=weather-]:not([data-testid=weather-label])').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  for (const id of wk) { await page.getByTestId(id!).click(); await page.waitForTimeout(700) }
  note.push('weathers=' + wk.length)
  for (const name of [/Реальная погода/, /Реальное время/, /Экономичный/]) {
    const t = page.getByRole('switch', { name })
    await t.click(); await page.waitForTimeout(800)
    note.push(name + ' ' + (await t.getAttribute('aria-checked')))
    await t.click(); await page.waitForTimeout(300)
  }
  await page.getByRole('button', { name: 'Закрыть' }).click()
  // locations
  await page.getByTestId('btn-location').click()
  const locs = await page.locator('[data-testid^=loc-]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  note.push('locs=' + locs.length)
  for (const id of locs.slice(0, 6)) {
    const btn = page.getByTestId(id!)
    if (!(await btn.isVisible())) await page.getByTestId('btn-location').click()
    await btn.click({ timeout: 5000 })
    await page.waitForTimeout(1500)
  }
  // fullscreen
  await page.getByTestId('btn-fullscreen').click(); await page.waitForTimeout(500)
  note.push('fs=' + (await page.evaluate(() => !!document.fullscreenElement)))
  await page.keyboard.press('f'); await page.waitForTimeout(500)
  // tab hidden
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForTimeout(1000)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForTimeout(1000)
  console.log('NOTES\n' + note.join('\n'))
  console.log('ERRORS\n' + errors.join('\n---\n'))
})

test('mobile 390x844', async ({ page }) => {
  const errors = track(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await enter(page)
  await page.waitForTimeout(1500)
  const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  const bar = await page.getByTestId('bottom-bar').boundingBox()
  await page.getByRole('button', { name: 'Микшер' }).click()
  await page.getByTestId('btn-settings').click()
  const panel = await page.getByTestId('panel-settings').boundingBox()
  const bar2 = await page.getByTestId('bottom-bar').boundingBox()
  await page.screenshot({ path: 'D:/dev-cache/tmp/shots/qa-mobile.png' })
  console.log('MOBILE', JSON.stringify({ ov, bar, bar2, panel, errors }))
})
