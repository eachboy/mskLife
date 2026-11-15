import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { type CDPSession, chromium, expect, type Page, test } from '@playwright/test'

/**
 * Жизненный цикл страницы и звука (promt2 §3, §10 Browser QA). Короткие тесты, без 30-мин ожидания.
 * Запуск на изолированной prod-сборке: npx playwright test -c scripts/soak.playwright.config.mjs
 *
 * ВАЖНО: Playwright эмулирует фокус/видимость — под ним вторая вкладка и свёрнутое окно остаются
 * visibilityState='visible' (проверено). Поэтому «настоящие» hidden-тесты запускают браузер
 * без Playwright и управляют им сырым CDP (см. RawBrowser ниже). Эмуляция через defineProperty
 * и Page.setWebLifecycleState — в Playwright-странице.
 */

type Diag = {
  contextState: string
  transportState: string
  instances: number
  music: { lateSteps: number; droppedNotes: number; activeVoices: number; nodes: number; ticks: number }
  nodes: { music: number; weather: number; city: number }
}
type Snap = {
  d: Diag
  ctxTime: number
  tr: number
  wall: number
  raf: number
  vis: string
  /** живых (не closed) AudioContext */
  contexts: number
  /** создано AudioContext за жизнь страницы */
  created: number
  peak: number
  entities: number
}

// Счётчик созданных AudioContext (до загрузки приложения) + счётчик кадров rAF.
const INIT = `(() => {
  window.__ctxList = []
  const Native = window.AudioContext
  if (Native) {
    window.AudioContext = class extends Native { constructor(...a) { super(...a); window.__ctxList.push(this) } }
  }
  window.__rafN = 0
  const f = () => { window.__rafN++; requestAnimationFrame(f) }
  requestAnimationFrame(f)
})()`

const SNAP = `(() => {
  const a = window.__audio
  const raw = a.T.getContext().rawContext
  const an = a.manager.analyser('master')
  const b = new Float32Array(an.fftSize)
  an.getFloatTimeDomainData(b)
  let peak = 0
  for (let i = 0; i < b.length; i++) peak = Math.max(peak, Math.abs(b[i]))
  return { d: a.manager.diagnostics(), ctxTime: raw.currentTime, tr: a.T.getTransport().seconds, wall: performance.now(),
    raf: window.__rafN, vis: document.visibilityState, created: window.__ctxList.length,
    contexts: window.__ctxList.filter((c) => c.state !== 'closed').length, peak,
    entities: document.querySelectorAll('[data-testid=entity]').length }
})()`

const RUNNING = `window.__audio?.manager.diagnostics()?.contextState === 'running'`

function totalNodes(d: Diag) {
  return d.nodes.music + d.nodes.weather + d.nodes.city
}

/** Между двумя снимками: Transport и ctx идут вместе со стенными часами (нет скачков/догонялок). */
function expectContinuity(a: Snap, b: Snap, label: string, tol = 0.5) {
  const dWall = (b.wall - a.wall) / 1000
  const dCtx = b.ctxTime - a.ctxTime
  const dTr = b.tr - a.tr
  expect(dCtx, `${label}: ctx.currentTime монотонно растёт`).toBeGreaterThan(0)
  expect(Math.abs(dCtx - dWall), `${label}: Δctx (${dCtx.toFixed(2)}) ≈ Δwall (${dWall.toFixed(2)})`).toBeLessThan(tol)
  expect(Math.abs(dTr - dCtx), `${label}: Transport не прыгает: Δtr ${dTr.toFixed(2)} vs Δctx ${dCtx.toFixed(2)}`).toBeLessThan(tol)
}

// ───────────────────────── Playwright-страница (эмуляция) ─────────────────────────

async function enter(page: Page) {
  await page.addInitScript(INIT)
  await page.goto('/?audiodebug')
  await page.getByTestId('enter-button').click()
  await page.waitForFunction(RUNNING, null, { timeout: 30_000 })
  await page.waitForTimeout(2500)
}
const snap = (page: Page) => page.evaluate(SNAP) as Promise<Snap>

test.describe('lifecycle: эмуляция в Playwright', () => {
  test('emulated hidden: ctx running, Transport идёт, нет второго экземпляра', async ({ page }) => {
    await enter(page)
    const a = await snap(page)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('blur'))
    })
    await page.waitForTimeout(4000)
    const b = await snap(page)
    expect(b.d.contextState).toBe('running')
    expect(b.d.transportState).toBe('started')
    expectContinuity(a, b, 'emulated hidden')
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    await page.waitForTimeout(1500)
    const c = await snap(page)
    expectContinuity(b, c, 'emulated visible')
    expect(c.d.instances).toBe(1)
    expect(c.created, 'новые AudioContext не создавались').toBe(a.created)
    expect(totalNodes(c.d)).toBe(totalNodes(a.d))
  })

  test('freeze → resume (CDP Page.setWebLifecycleState): звук и Transport восстанавливаются без дублей', async ({ page }, info) => {
    await enter(page)
    const cdp: CDPSession = await page.context().newCDPSession(page)
    const a = await snap(page)
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
    const tFreeze = Date.now()
    await new Promise((r) => setTimeout(r, 6000))
    await cdp.send('Page.setWebLifecycleState', { state: 'active' })
    const frozenFor = (Date.now() - tFreeze) / 1000
    await page.waitForFunction(RUNNING, null, { timeout: 5000 })
    await page.waitForTimeout(1500)
    const b = await snap(page)
    const dCtx = b.ctxTime - a.ctxTime
    const dWall = (b.wall - a.wall) / 1000
    info.annotations.push({
      type: 'freeze',
      description: `frozen ${frozenFor.toFixed(1)} с: Δwall ${dWall.toFixed(2)} с, Δctx ${dCtx.toFixed(2)} с, Δtransport ${(b.tr - a.tr).toFixed(2)} с, lateSteps +${b.d.music.lateSteps - a.d.music.lateSteps}, ticks +${b.d.music.ticks - a.d.music.ticks}, recovery ${JSON.stringify((await page.evaluate(() => (window as unknown as { __audio: { manager: { diagnostics: () => { lastRecovery: string | null } } } }).__audio.manager.diagnostics().lastRecovery)))}`,
    })
    expect(b.d.contextState).toBe('running')
    expect(b.d.transportState).toBe('started')
    // Transport привязан к ctx: что бы ни было с ctx во время заморозки, позиция не прыгает относительно него
    expect(Math.abs(b.tr - a.tr - dCtx), 'Transport ↔ ctx после resume').toBeLessThan(0.5)
    expect(b.d.instances).toBe(1)
    expect(b.created, 'новые AudioContext не создавались').toBe(a.created)
    expect(totalNodes(b.d)).toBe(totalNodes(a.d))
    // rAF снова идёт
    const r0 = b.raf
    await page.waitForTimeout(1000)
    expect((await snap(page)).raf - r0).toBeGreaterThan(20)
  })

  test('за жизнь страницы ровно один живой AudioContext', async ({ page }, info) => {
    // ИЗВЕСТНЫЙ БАГ (снять test.fail после исправления): `import('tone')` создаёт глобальный контекст по
    // умолчанию (tone/build/esm/index.js: `export const Transport = getContext().transport` и т.п.),
    // затем AudioMixer.ts:57-58 создаёт второй `new T.Context(...)` и `T.setContext(ctx)` без disposeOld —
    // первый AudioContext (latencyHint 'interactive') остаётся running и рендерит тишину.
    test.fail(true, 'второй AudioContext от Tone по умолчанию — src/audio/engine/AudioMixer.ts:58')
    await enter(page)
    const s = await snap(page)
    info.annotations.push({ type: 'contexts', description: `создано ${s.created}, живых ${s.contexts}` })
    expect(s.contexts).toBe(1)
  })

  test('повторный ENTER / play / start(): один экземпляр, узлы не удваиваются', async ({ page }) => {
    await page.addInitScript(INIT)
    await page.goto('/?audiodebug')
    const btn = page.getByTestId('enter-button')
    await btn.dblclick()
    await page.evaluate(() => (document.querySelector('[data-testid=enter-button]') as HTMLElement | null)?.click())
    await page.waitForFunction(RUNNING, null, { timeout: 30_000 })
    await page.waitForTimeout(2500)
    const a = await snap(page)
    await page.evaluate(async () => {
      const m = (window as unknown as { __audio: { manager: { start: () => Promise<void> } } }).__audio.manager
      await Promise.all([m.start(), m.start(), m.start()])
    })
    for (let i = 0; i < 6; i++) await page.getByTestId('play-toggle').click()
    for (let i = 0; i < 4; i++) await page.keyboard.press('Space')
    await page.waitForTimeout(3000)
    const b = await snap(page)
    expect(b.d.instances).toBe(1)
    // двойной ENTER не создал лишних контекстов сверх известных двух (Tone default + микшер)
    expect(a.created, 'AudioContext после двойного ENTER').toBeLessThanOrEqual(2)
    expect(b.created, 'новые AudioContext не создавались').toBe(a.created)
    expect(totalNodes(b.d)).toBe(totalNodes(a.d))
    expect(b.d.music.activeVoices).toBeLessThanOrEqual(16)
    expectContinuity(a, b, 'после повторных start/play', 0.6)
  })

  test('повторный монтаж UI (панели, смена сценария ×4): звук не пересоздаётся, слушатели не копятся', async ({ page }) => {
    await enter(page)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    const listeners = async () => {
      await cdp.send('HeapProfiler.collectGarbage')
      const { metrics } = await cdp.send('Performance.getMetrics')
      return metrics.find((m) => m.name === 'JSEventListeners')!.value
    }
    const a = await snap(page)
    const counts: number[] = []
    for (let cycle = 0; cycle < 4; cycle++) {
      for (const p of ['btn-settings', 'btn-location', 'btn-settings']) {
        await page.getByTestId(p).click()
        await page.getByRole('dialog').waitFor()
        await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).click()
      }
      await page.getByTestId('btn-scenario').click()
      // кнопки: 0 — «Закрыть», дальше режимы; чередуем два режима, чтобы циклы 2 и 4 были в одном сценарии
      await page.getByRole('dialog').locator('button').nth(1 + (cycle % 2)).click()
      await page.waitForTimeout(4000)
      counts.push(await listeners())
    }
    const b = await snap(page)
    expect(b.d.instances).toBe(1)
    expect(b.created, 'новые AudioContext не создавались').toBe(a.created)
    expect(b.d.contextState).toBe('running')
    expect(totalNodes(b.d)).toBe(totalNodes(a.d))
    expectContinuity(a, b, 'после смены сценариев', 0.8)
    test.info().annotations.push({ type: 'listeners', description: counts.join(' → ') })
    // 1-й цикл — прогрев (ленивые панели, первая сцена каждого типа); сравниваем 2-й и 4-й
    expect(counts[3], `слушатели: ${counts.join(' → ')}`).toBeLessThan(counts[1] * 1.1)
  })
})

// ───────────────────────── настоящий браузер без Playwright (сырой CDP) ─────────────────────────

type Sess = { send: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>>; ev: <T>(expr: string) => Promise<T> }

class RawBrowser {
  private ws!: WebSocket
  private id = 0
  private pend = new Map<number, { res: (v: Record<string, unknown>) => void; rej: (e: Error) => void }>()
  private proc!: ReturnType<typeof spawn>
  static async launch(exe: string, port: number, udd: string): Promise<RawBrowser> {
    const b = new RawBrowser()
    mkdirSync(udd, { recursive: true })
    // настоящее окно; окклюзию Windows отключаем, иначе окно, открытое под другими окнами, сразу hidden.
    // Вкладка поверх и сворачивание при этом дают hidden, как у пользователя (проверено).
    b.proc = spawn(
      exe,
      [`--remote-debugging-port=${port}`, `--user-data-dir=${udd}`, '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--disable-features=CalculateNativeWinOcclusion', '--window-position=60,60', '--window-size=1280,760', 'about:blank'],
      { stdio: 'ignore' },
    )
    let url = ''
    for (let i = 0; i < 75 && !url; i++) {
      try {
        url = ((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl
      } catch {
        await new Promise((r) => setTimeout(r, 200))
      }
    }
    b.ws = new WebSocket(url)
    await new Promise((r) => b.ws.addEventListener('open', r, { once: true }))
    b.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String(ev.data))
      const p = m.id && b.pend.get(m.id)
      if (!p) return
      b.pend.delete(m.id)
      if (m.error) p.rej(new Error(JSON.stringify(m.error)))
      else p.res(m.result)
    })
    return b
  }
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    return new Promise((res, rej) => {
      const i = ++this.id
      this.pend.set(i, { res, rej })
      this.ws.send(JSON.stringify({ id: i, method, params, sessionId }))
    })
  }
  async attach(targetId: string): Promise<Sess> {
    const { sessionId } = (await this.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string }
    const send = (m: string, p: Record<string, unknown> = {}) => this.send(m, p, sessionId)
    const ev = async <T>(expression: string): Promise<T> => {
      const r = (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })) as { result: { value: T }; exceptionDetails?: unknown }
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400))
      return r.result.value
    }
    return { send, ev }
  }
  async close() {
    await this.send('Browser.close').catch(() => undefined)
    setTimeout(() => this.proc.kill(), 500)
  }
}

const EXES: Record<string, string> = {
  chromium: chromium.executablePath(),
  msedge: ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync) ?? '',
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(fn: () => Promise<boolean>, ms: number) {
  const t = Date.now()
  while (Date.now() - t < ms) {
    if (await fn()) return true
    await wait(200)
  }
  return false
}

test.describe('lifecycle: настоящая вкладка/окно (без эмуляции Playwright)', () => {
  test('вторая вкладка поверх и свёрнутое окно: звук идёт, rAF стоит, без дублей и скачков', async ({ baseURL }, info) => {
    test.setTimeout(150_000)
    const exe = EXES[info.project.name]
    test.skip(!exe || !existsSync(exe), `нет исполняемого файла для ${info.project.name}`)
    const port = 9400 + info.workerIndex * 10 + (info.project.name === 'msedge' ? 1 : 0)
    const b = await RawBrowser.launch(exe, port, `D:/dev-cache/tmp/soak/udd-${info.project.name}`)
    try {
      const { targetInfos } = (await b.send('Target.getTargets')) as { targetInfos: Array<{ type: string; targetId: string }> }
      const mainId = targetInfos.find((t) => t.type === 'page')!.targetId
      const p = await b.attach(mainId)
      await p.send('Page.enable')
      await p.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT })
      await p.send('Page.navigate', { url: `${baseURL}/?audiodebug` })
      expect(await until(() => p.ev<boolean>(`!!document.querySelector('[data-testid=enter-button]')`), 20_000)).toBe(true)
      await wait(500)
      await p.ev(`document.querySelector('[data-testid=enter-button]').click()`)
      expect(await until(() => p.ev<boolean>(RUNNING), 30_000), 'звук стартовал').toBe(true)
      await wait(3000)
      const s0 = await p.ev<Snap>(SNAP)
      expect(s0.vis).toBe('visible')

      // 1) вторая вкладка поверх
      const { targetId: tab2 } = (await b.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string }
      expect(await until(async () => (await p.ev<string>('document.visibilityState')) === 'hidden', 5000), 'вкладка стала hidden').toBe(true)
      const h0 = await p.ev<Snap>(SNAP)
      let maxPeak = 0
      for (let i = 0; i < 20; i++) {
        await wait(500)
        maxPeak = Math.max(maxPeak, (await p.ev<Snap>(SNAP)).peak)
      }
      const h1 = await p.ev<Snap>(SNAP)
      const hiddenSec = (h1.wall - h0.wall) / 1000
      expect(h1.d.contextState, 'ctx running при hidden').toBe('running')
      expect(h1.d.transportState).toBe('started')
      expectContinuity(h0, h1, 'hidden (вкладка)')
      expect(maxPeak, 'на мастере есть сигнал при hidden').toBeGreaterThan(1e-3)
      const rafHidden = (h1.raf - h0.raf) / hiddenSec
      expect(rafHidden, `rAF при hidden ${rafHidden.toFixed(1)}/с`).toBeLessThan(2)
      expect.soft(h1.d.music.lateSteps - h0.d.music.lateSteps, 'lateSteps при hidden').toBe(0)

      await b.send('Target.activateTarget', { targetId: mainId })
      await b.send('Target.closeTarget', { targetId: tab2 })
      expect(await until(async () => (await p.ev<string>('document.visibilityState')) === 'visible', 5000)).toBe(true)
      await wait(1500)
      const v1 = await p.ev<Snap>(SNAP)
      expectContinuity(h1, v1, 'возврат во вкладку')
      expect(v1.d.instances).toBe(1)
      expect(v1.created, 'новые AudioContext не создавались').toBe(s0.created)
      expect(totalNodes(v1.d)).toBe(totalNodes(s0.d))
      const r0 = v1.raf
      await wait(1000)
      expect((await p.ev<Snap>(SNAP)).raf - r0, 'rAF вернулся').toBeGreaterThan(20)

      // 2) свёрнутое окно
      const { windowId } = (await p.send('Browser.getWindowForTarget')) as { windowId: number }
      await b.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } })
      const becameHidden = await until(async () => (await p.ev<string>('document.visibilityState')) === 'hidden', 5000)
      const m0 = await p.ev<Snap>(SNAP)
      await wait(8000)
      const m1 = await p.ev<Snap>(SNAP)
      info.annotations.push({
        type: 'minimized',
        description: `${info.project.name}: visibilityState=${m1.vis} (hidden достигнут: ${becameHidden}), rAF ${((m1.raf - m0.raf) / ((m1.wall - m0.wall) / 1000)).toFixed(1)}/с, ctx ${m1.d.contextState}, lateSteps +${m1.d.music.lateSteps - m0.d.music.lateSteps}`,
      })
      expect(m1.d.contextState, 'ctx running при свёрнутом окне').toBe('running')
      expectContinuity(m0, m1, 'свёрнутое окно')
      await b.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
      await until(async () => (await p.ev<string>('document.visibilityState')) === 'visible', 5000)
      await wait(1500)
      const m2 = await p.ev<Snap>(SNAP)
      expectContinuity(m1, m2, 'восстановление окна')
      expect(m2.d.instances).toBe(1)
      expect(m2.created, 'новые AudioContext не создавались').toBe(s0.created)
      expect(totalNodes(m2.d)).toBe(totalNodes(s0.d))
      info.annotations.push({
        type: 'hidden-tab',
        description: `${info.project.name}: hidden ${hiddenSec.toFixed(1)} с, rAF ${rafHidden.toFixed(1)}/с, пик мастера ${(20 * Math.log10(maxPeak)).toFixed(1)} дБ, lateSteps +${h1.d.music.lateSteps - h0.d.music.lateSteps}, голоса ${s0.d.music.activeVoices}→${v1.d.music.activeVoices}, узлы ${totalNodes(s0.d)}→${totalNodes(m2.d)}`,
      })
    } finally {
      await b.close()
    }
  })
})
