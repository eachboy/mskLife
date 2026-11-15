import { expect, test } from '@playwright/test'

test('stress: locations + rapid toggles + warning source', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push('PAGEERR ' + e.message + '\n' + (e.stack ?? '').split('\n').slice(0, 8).join('\n')))
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.type() + ' ' + m.text() + ' @' + JSON.stringify(m.location())))
  await page.goto('/')
  await page.getByTestId('enter-button').click()
  await expect(page.getByTestId('start-screen')).toBeHidden({ timeout: 10_000 })
  const out: string[] = []
  await page.getByTestId('btn-location').click()
  await page.waitForTimeout(600)
  const locs = await page.locator('[data-testid^=loc-]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!))
  out.push('locs=' + locs.length)
  await page.getByTestId('btn-location').click()
  for (const id of locs.slice(0, 8)) {
    await page.waitForTimeout(450)
    if (!(await page.getByTestId(id).count())) await page.getByTestId('btn-location').click()
    await page.waitForTimeout(450)
    await page.getByTestId(id).click()
    await page.waitForTimeout(900)
    if (!(await page.getByTestId(id).count())) { /* closed */ }
  }
  await page.waitForTimeout(8000)
  out.push('loc after=' + (await page.evaluate(() => document.querySelector('[data-testid=clock]')?.textContent)))
  const play = page.getByTestId('play-toggle')
  for (let i = 0; i < 20; i++) await play.click({ delay: 0 })
  await page.keyboard.press('Space'); await page.keyboard.press('Space')
  const st = await page.evaluate(async () => {
    const T: any = await import('/node_modules/.vite/deps/tone.js').catch(() => null)
    return T ? T.getContext().state : 'n/a'
  })
  out.push('ctx=' + st)
  await page.reload()
  await page.getByTestId('enter-button').click()
  await page.waitForTimeout(3000)
  console.log('OUT\n' + out.join('\n') + '\nERR\n' + errors.join('\n---\n'))
})
