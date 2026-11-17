// Замер скрытой вкладки на изолированной production-сборке (docs/BUGFIX_AND_OPTIMIZATION_AUDIT.md §2.3, §6).
//   node scripts/bg-cpu.mjs [--build] [--visible] [--secs 60] [--port 5196] [--dist D:/dev-cache/tmp/mlbg] [--cpu 1] [--headed]
// Сырой CDP (без Playwright-эмуляции фокуса/видимости, она делает все вкладки «visible»): свой Chromium
// (--headless=new), вторая вкладка Target.createTarget + Target.activateTarget → первая реально hidden.
// visibilityState читается до и после окна. Playwright нужен только ради пути к браузеру.
// Счётчики (Page.addScriptToEvaluateOnNewDocument): rAF (планирование/исполнение), Canvas2D stroke/fill/drawImage/clearRect,
// WebGL/WebGL2 drawArrays/drawElements, CSSStyleDeclaration.setProperty, коммиты React
// (__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot — вызывается и в production-сборке React).
// CDP Performance.getMetrics: TaskDuration, ScriptDuration, LayoutCount, RecalcStyleCount — дельты за окно.
// --visible: то же окно в видимой вкладке; пороги: коммиты React ≤ 2/с, остальное информационно.
// Код выхода 1 при провале любой проверки.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { chromium } from '@playwright/test'

const argv = process.argv.slice(2)
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d)
const SECS = Number(opt('--secs', 60))
const PORT = Number(opt('--port', 5196))
const DIST = opt('--dist', 'D:/dev-cache/tmp/mlbg')
const CPU = Number(opt('--cpu', 1))
const VISIBLE = argv.includes('--visible')
const KILL = opt('--kill', '').split(',').filter(Boolean) // music,weather,city,travel — dispose движков перед окном замера
const REALTIME = argv.includes('--realtime') // timeMode='realtime' (1:1)
const HEAP = argv.includes('--heap') // heap после GC каждые 60 с, наклон МБ/мин
const JSON_OUT = argv.includes('--json')
const TRACE = argv.includes('--trace') // какие компоненты обновились в каждом коммите (нужна сборка с --minify false: --build-args)
const DBG = 9344
const isWin = process.platform === 'win32'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (argv.includes('--build')) {
  const r = spawnSync(
    'npx',
    ['vite', 'build', '--outDir', DIST, '--emptyOutDir', ...(TRACE ? ['--minify', 'false'] : [])],
    { shell: isWin, stdio: 'inherit' },
  )
  if (r.status !== 0) process.exit(1)
}
let srv = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], {
  shell: isWin,
  stdio: 'ignore',
})
let chrome = null
const killTree = (p) => {
  if (!p) return
  if (isWin) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'])
  else p.kill()
}
const cleanup = () => {
  killTree(chrome)
  killTree(srv)
  chrome = srv = null
}
for (let i = 0; i < 40; i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/`)).ok) break
  } catch {}
  await sleep(500)
}

let code = 1
try {
  chrome = spawn(
    chromium.executablePath(),
    [
      argv.includes('--headed') ? '--window-size=1600,1000' : '--headless=new',
      `--remote-debugging-port=${DBG}`,
      `--user-data-dir=${mkdtempSync('D:/dev-cache/tmp/bgprof-')}`,
      '--window-size=1600,900',
      '--no-first-run',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-precise-memory-info',
      '--use-angle=d3d11',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  let wsUrl = ''
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json()).webSocketDebuggerUrl
    } catch {
      await sleep(500)
    }
  }
  if (!wsUrl) throw new Error('Chromium debug endpoint недоступен')

  // минимальный клиент CDP
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  let id = 0
  const pending = new Map()
  const errors = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id) {
      const p = pending.get(m.id)
      pending.delete(m.id)
      if (p) m.error ? p.rej(new Error(`${m.error.message}`)) : p.res(m.result)
    } else if (m.method === 'Runtime.exceptionThrown')
      errors.push(`pageerror: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`)
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errors.push(`error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`)
  }
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const i = ++id
      pending.set(i, { res, rej })
      ws.send(JSON.stringify({ id: i, method, params, sessionId }))
    })
  const open = async (url) => {
    const { targetId } = await send('Target.createTarget', { url })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    return { targetId, sessionId }
  }
  const evalIn = async (sessionId, expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }

  const t1 = await open('about:blank')
  const S = t1.sessionId
  await send('Page.enable', {}, S)
  await send('Runtime.enable', {}, S)
  await send('Performance.enable', {}, S)
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false }, S)
  if (CPU > 1) await send('Emulation.setCPUThrottlingRate', { rate: CPU }, S)
  await send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `(() => {
    const C = { raf: 0, rafRun: 0, c2d: 0, gl: 0, style: 0, commits: 0 }
    window.__bg = C
    const rafOrig = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => { C.raf++; return rafOrig((t) => { C.rafRun++; cb(t) }) }
    for (const k of ['stroke', 'fill', 'drawImage', 'clearRect']) {
      const o = CanvasRenderingContext2D.prototype[k]
      CanvasRenderingContext2D.prototype[k] = function (...a) { C.c2d++; return o.apply(this, a) }
    }
    for (const proto of [window.WebGLRenderingContext && WebGLRenderingContext.prototype, window.WebGL2RenderingContext && WebGL2RenderingContext.prototype]) {
      if (!proto) continue
      for (const k of ['drawArrays', 'drawElements']) {
        const o = proto[k]
        proto[k] = function (...a) { C.gl++; return o.apply(this, a) }
      }
    }
    const sp = CSSStyleDeclaration.prototype.setProperty
    CSSStyleDeclaration.prototype.setProperty = function (...a) { C.style++; return sp.apply(this, a) }
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(), inject() { return 1 },
      onCommitFiberRoot(_id, root) {
        C.commits++
        if (!${TRACE}) return
        const out = []
        const walk = (f, d) => {
          for (; f; f = f.sibling) {
            const n = typeof f.type === 'function' ? (f.type.displayName || f.type.name) : typeof f.type === 'object' && f.type ? (f.type.displayName || f.type.render?.name || f.type.type?.name) : null
            if (n && f.alternate && (f.memoizedState !== f.alternate.memoizedState || f.memoizedProps !== f.alternate.memoizedProps) && (f.flags & 1) ) out.push(n)
            if (f.child && d < 60) walk(f.child, d + 1)
          }
        }
        try { walk(root.current.child, 0) } catch {}
        ;(C.trace ??= []).push(Math.round(performance.now() / 1000) + ' n=' + out.length)
      }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {},
    }
  })()`,
    },
    S,
  )
  await send('Page.navigate', { url: `http://localhost:${PORT}/?audiodebug&perf` }, S)
  const until = async (expr, ms = 30000) => {
    const t = Date.now()
    while (Date.now() - t < ms) {
      try {
        if (await evalIn(S, expr)) return
      } catch {}
      await sleep(250)
    }
    throw new Error(`таймаут: ${expr}`)
  }
  await until(`!!document.querySelector('[data-testid=enter-button]')`)
  await evalIn(S, `document.querySelector('[data-testid=enter-button]').click()`)
  await until(`window.__audio?.manager.diagnostics()?.contextState === 'running'`)
  await sleep(3000) // прогрев первой сцены
  if (REALTIME) await until(`!!window.__world`), await evalIn(S, `window.__world.engine.setTimeMode('realtime')`)
  if (TRACE)
    await until(`!!window.__world`),
      await evalIn(
        S,
        `(() => { window.__sd = []; window.__world.store.subscribe((s, p) => { const k = Object.keys(s).filter((x) => s[x] !== p[x]); window.__sd.push(Math.round(performance.now()/1000) + ':' + k.join('+')) }) })()`,
      )
  for (const k of KILL) await evalIn(S, `window.__audio.${k}.dispose()`)
  if (KILL.length) await sleep(1500)

  let t2 = null
  if (!VISIBLE) {
    t2 = await open('about:blank')
    await send('Target.activateTarget', { targetId: t2.targetId })
  }
  await sleep(Number(opt('--settle', 12)) * 1000) // дать погоде сойтись (лерп ~30 с после ENTER) и закончиться переходу в hidden
  const vis0 = await evalIn(S, 'document.visibilityState')

  const getM = async () =>
    Object.fromEntries((await send('Performance.getMetrics', {}, S)).metrics.map((x) => [x.name, x.value]))
  const snap = () =>
    evalIn(
      S,
      `({
      ...window.__bg,
      clock: document.querySelector('[data-testid=clock]')?.textContent?.trim() ?? '',
      loc: document.querySelector('[data-location]')?.getAttribute('data-location') ?? '',
      caption: document.querySelector('[data-testid=caption]')?.textContent ?? '',
      diag: window.__audio.manager.diagnostics(),
      trace: window.__bg.trace?.slice(),
      ek: window.__world?.store.getState().eventKey ?? 0,
    })`,
    )
  const a0 = await snap()
  const m0 = await getM()
  const tA = Date.now()
  if (argv.includes('--profile'))
    await send('Profiler.enable', {}, S),
      await send('Profiler.setSamplingInterval', { interval: 500 }, S),
      await send('Profiler.start', {}, S)
  const heap = []
  const heapNow = async () => {
    await send('HeapProfiler.collectGarbage', {}, S)
    return (await evalIn(S, 'performance.memory.usedJSHeapSize')) / 1048576
  }
  if (HEAP) {
    await send('HeapProfiler.enable', {}, S)
    for (let t = 0; t < SECS; t += 60) {
      heap.push([t, await heapNow()])
      await sleep(Math.min(60, SECS - t) * 1000 - 300)
    }
    heap.push([SECS, await heapNow()])
  } else await sleep(SECS * 1000)
  if (argv.includes('--profile')) {
    const { profile } = await send('Profiler.stop', {}, S)
    const dt = profile.timeDeltas,
      self = new Map(),
      byId = new Map(profile.nodes.map((n) => [n.id, n]))
    profile.samples.forEach((sid, i) => self.set(sid, (self.get(sid) ?? 0) + (dt[i] ?? 0)))
    const agg = new Map()
    for (const [sid, us] of self) {
      const f = byId.get(sid).callFrame
      const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`
      agg.set(k, (agg.get(k) ?? 0) + us)
    }
    console.log('PROFILE top self-time (мс за окно):')
    for (const [k, us] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 25))
      console.log(String((us / 1000).toFixed(0)).padStart(7), k)
  }
  const tB = Date.now()
  const a1 = await snap()
  const m1 = await getM()
  const vis1 = await evalIn(S, 'document.visibilityState')
  const wall = (tB - tA) / 1000

  const d = (k) => a1[k] - a0[k]
  const dm = (k) => m1[k] - m0[k]
  const rows = []
  const row = (name, val, thr, ok) => rows.push([name, val, thr, ok === null ? 'инфо' : ok ? 'ОК' : 'ПРОВАЛ'])
  const hidden = !VISIBLE
  row(
    'visibilityState до/после',
    `${vis0}/${vis1}`,
    hidden ? 'hidden/hidden' : 'visible/visible',
    hidden ? vis0 === 'hidden' && vis1 === 'hidden' : vis0 === 'visible' && vis1 === 'visible',
  )
  row('окно, с', wall.toFixed(1), `${SECS}`, null)
  const zero = (name, v) => row(name, v, '0', hidden ? v === 0 : null)
  zero('rAF: вызовов requestAnimationFrame', d('raf'))
  zero('rAF: исполнено колбэков', d('rafRun'))
  zero('canvas 2D: stroke/fill/drawImage/clearRect', d('c2d'))
  zero('WebGL: drawArrays/drawElements', d('gl'))
  zero('CSS setProperty', d('style'))
  const task = dm('TaskDuration')
  const events = (a1.ek ?? 0) - (a0.ek ?? 0)
  // §6: без музыки — 0.9 с на 60-с окно (1.5 %); при перемотке добавляем 0.06 с на событие окна.
  // С музыкой порог не ставим: звук планируется и в фоне, его стоимость считается отдельно.
  const taskLimit = KILL.includes('music') ? (0.9 * SECS) / 60 + (REALTIME ? 0 : 0.06 * events) : null
  const taskLabel = taskLimit
    ? `≤ ${taskLimit.toFixed(2)} с${REALTIME ? ' (0.9 с/мин)' : ` (0.9 с/мин + 0.06 с × ${events} соб.)`}`
    : 'инфо (с музыкой)'
  row(
    'TaskDuration, с (CPU %)',
    `${task.toFixed(3)} (${((task / wall) * 100).toFixed(2)} %)`,
    taskLabel,
    hidden && taskLimit ? task <= taskLimit : null,
  )
  row('ScriptDuration, с', dm('ScriptDuration').toFixed(3), '—', null)
  zero('LayoutCount (дельта)', dm('LayoutCount'))
  zero('RecalcStyleCount (дельта)', dm('RecalcStyleCount'))
  const commits = d('commits')
  const commitsLimit = REALTIME ? Math.ceil(SECS / 60) : null // 1:1 — ≤ 1 в минуту; x60 — по числу событий (ниже)
  if (VISIBLE) row('коммиты React за окно', commits, `≤ ${2 * SECS} (≤ 2/с)`, commits <= 2 * SECS)
  else if (REALTIME)
    row(
      'коммиты React за окно (realtime)',
      `${commits} за ${SECS} с, событий ${events}`,
      `≤ ${commitsLimit} (≤ 1/мин)`,
      commits <= commitsLimit,
    )
  else
    row(
      'коммиты React за окно (x60)',
      `${commits}, событий ${events} (${events ? (commits / events).toFixed(1) : '—'} на событие)`,
      '≤ 3·событий + 10',
      commits <= 3 * events + 10,
    )
  if (HEAP && heap.length > 3) {
    const pts = heap.filter(([t]) => t >= 120)
    const n = pts.length,
      mx = pts.reduce((a, [t]) => a + t / 60, 0) / n,
      my = pts.reduce((a, [, y]) => a + y, 0) / n
    const slope =
      pts.reduce((a, [t, y]) => a + (t / 60 - mx) * (y - my), 0) / pts.reduce((a, [t]) => a + (t / 60 - mx) ** 2, 0)
    row(
      'heap после GC, МБ/мин (с 2-й минуты)',
      `${slope.toFixed(3)} (${heap.map(([, y]) => y.toFixed(1)).join(' → ')})`,
      '≤ 0.05',
      slope <= 0.05,
    )
  }
  row('contextState', a1.diag?.contextState, 'running', a1.diag?.contextState === 'running')
  row('AudioContext (живых)', `${a0.diag.contexts} → ${a1.diag.contexts}`, '1', a1.diag.contexts === 1)
  row('узлы music/weather/city/travel', `${JSON.stringify(a0.diag.nodes)} → ${JSON.stringify(a1.diag.nodes)}`, 'плато', null)
  const late = a1.diag.music.lateSteps - a0.diag.music.lateSteps
  const drop = a1.diag.music.droppedNotes - a0.diag.music.droppedNotes
  row('lateSteps / droppedNotes (дельта)', `${late} / ${drop}`, '0 / 0', late === 0 && drop === 0)
  // eventKey в prod-сборке снаружи недоступен (стор не экспортируется): прогресс симуляции — по часам/локации/подписи
  const progressed = REALTIME || a1.clock !== a0.clock || a1.loc !== a0.loc || a1.caption !== a0.caption
  row(
    'симуляция идёт (часы/локация/подпись; eventKey недоступен из prod)',
    `${a0.clock} ${a0.loc} -> ${a1.clock} ${a1.loc}`,
    'изменились',
    hidden ? progressed : null,
  )
  row('ошибки консоли', errors.length, '0', errors.length === 0)

  console.log(
    `\nbg-cpu ${VISIBLE ? '--visible' : '(скрытая вкладка)'} · ${new Date().toISOString()} · CPU throttling ${CPU}x`,
  )
  console.log('| метрика | значение | порог | статус |')
  console.log('|---|---|---|---|')
  for (const r of rows) console.log(`| ${r.join(' | ')} |`)
  if (TRACE) console.log('TRACE коммиты:', JSON.stringify(await evalIn(S, 'window.__bg.trace')))
  if (TRACE) console.log('TRACE стор:', JSON.stringify(await evalIn(S, 'window.__sd.slice(-40)')))
  if (errors.length) console.log(errors.slice(0, 10).join('\n'))
  if (JSON_OUT)
    console.log(
      'RESULT ' +
        JSON.stringify({
          task,
          scriptDur: dm('ScriptDuration'),
          commits,
          events,
          style: d('style'),
          kill: KILL,
          realtime: REALTIME,
        }),
    )
  code = rows.some((r) => r[3] === 'ПРОВАЛ') ? 1 : 0
  ws.close()
} catch (e) {
  console.error(e)
} finally {
  cleanup()
}
process.exit(code)
