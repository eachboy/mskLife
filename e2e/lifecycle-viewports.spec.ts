import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

/** Разрешения (promt2 §10 Browser QA): нет горизонтального скролла, сцена и панель управления в кадре. */
const SIZES = [
  { w: 1920, h: 1080 },
  { w: 1366, h: 768 },
  { w: 390, h: 844 },
]
const OUT = 'D:/dev-cache/tmp/soak/viewports'

for (const { w, h } of SIZES) {
  test(`viewport ${w}×${h}: без горизонтального скролла, сцена не обрезана`, async ({ page }, info) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/')
    const noHScroll = () =>
      page.evaluate(() => {
        window.scrollBy(500, 0)
        return {
          doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          body: document.body.scrollWidth - document.body.clientWidth,
          scrollX: window.scrollX,
        }
      })
    const start = await noHScroll()
    expect(start, 'стартовый экран').toEqual({ doc: 0, body: 0, scrollX: 0 })
    await page.screenshot({ path: `${OUT}/${info.project.name}-${w}x${h}-start.png` })
    await page.getByTestId('enter-button').click()
    await page.getByTestId('bottom-bar').waitFor()
    await page.waitForTimeout(3500)
    expect(await noHScroll(), 'после входа').toEqual({ doc: 0, body: 0, scrollX: 0 })

    // сцена покрывает весь вьюпорт
    const scene = await page.getByTestId('scene').boundingBox()
    expect(scene).not.toBeNull()
    expect(scene!.x).toBeLessThanOrEqual(0.5)
    expect(scene!.y).toBeLessThanOrEqual(0.5)
    expect(scene!.width).toBeGreaterThanOrEqual(w - 1)
    expect(scene!.height).toBeGreaterThanOrEqual(h - 1)

    // элементы управления целиком в кадре, нижняя панель не выше половины экрана
    for (const id of ['bottom-bar', 'play-toggle', 'btn-settings', 'clock']) {
      const bb = await page.getByTestId(id).first().boundingBox()
      expect(bb, id).not.toBeNull()
      expect(bb!.x, `${id} слева`).toBeGreaterThanOrEqual(-0.5)
      expect(bb!.x + bb!.width, `${id} справа`).toBeLessThanOrEqual(w + 0.5)
      expect(bb!.y + bb!.height, `${id} снизу`).toBeLessThanOrEqual(h + 0.5)
    }
    const bar = (await page.getByTestId('bottom-bar').boundingBox())!
    const topBar = await page.getByTestId('top-bar').boundingBox()
    const covered = bar.height + (topBar?.height ?? 0)
    info.annotations.push({ type: 'chrome', description: `${w}×${h}: нижняя панель ${Math.round(bar.height)} px, верхняя ${Math.round(topBar?.height ?? 0)} px, открыто сцены ${Math.round((1 - covered / h) * 100)} %` })
    expect(covered / h, 'UI закрывает не больше 45 % высоты').toBeLessThan(0.45)

    // в SVG сцены (1600×900, xMidYMax slice) видимая доля ширины — для отчёта
    const vis = Math.min(1, (w / h) / (1600 / 900))
    info.annotations.push({ type: 'scene-crop', description: `видно ${Math.round(vis * 100)} % ширины кадра 1600 (центр)` })
    await page.screenshot({ path: `${OUT}/${info.project.name}-${w}x${h}-scene.png` })
  })
}
