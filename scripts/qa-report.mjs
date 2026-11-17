// Единый QA-отчёт MOSCOW LIFE: npm run qa  [-- --skip-e2e] [-- --out <dir>]
// Шаги: typecheck → lint → unit+coverage → build → e2e (функц. + a11y + visual) → perf (web-vitals, heap, DOM на preview-сборке).
// Отчёт: <out>/QA_REPORT.md (по умолчанию D:/dev-cache/tmp/qa). Код выхода 1, если хоть один обязательный шаг упал.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'D:/dev-cache/tmp/qa'
const SKIP_E2E = args.includes('--skip-e2e')
mkdirSync(OUT, { recursive: true })
const isWin = process.platform === 'win32'

function run(name, cmd, cmdArgs, { timeout = 600_000, optional = false } = {}) {
  const t0 = Date.now()
  process.stdout.write(`▶ ${name}… `)
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', timeout, shell: isWin, env: { ...process.env, CI: '1', FORCE_COLOR: '0' } })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  const ok = r.status === 0
  const sec = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(ok ? `OK (${sec}s)` : `FAIL (${sec}s)`)
  writeFileSync(path.join(OUT, `${name.replace(/\W+/g, '_')}.log`), out)
  return { name, ok, optional, sec, tail: out.trim().split('\n').slice(-12).join('\n') }
}

const steps = []
steps.push(run('typecheck', 'npx', ['tsc', '-b', '--noEmit']))
steps.push(run('lint', 'npx', ['biome', 'lint', 'src', 'e2e', 'scripts']))
steps.push(run('unit+coverage', 'npx', ['vitest', 'run', '--coverage', '--coverage.reporter=text-summary', '--coverage.reporter=json-summary', `--coverage.reportsDirectory=${OUT}/coverage`]))
steps.push(run('build', 'npx', ['vite', 'build', '--outDir', `${OUT}/dist`, '--emptyOutDir']))
if (!SKIP_E2E) {
  steps.push(run('e2e-functional', 'npx', ['playwright', 'test', 'e2e/app.spec.ts', 'e2e/qa-full.spec.ts', 'e2e/qa-stress.spec.ts', '--reporter=line']))
  steps.push(run('e2e-a11y', 'npx', ['playwright', 'test', 'e2e/a11y.spec.ts', '--reporter=line']))
  steps.push(run('e2e-visual', 'npx', ['playwright', 'test', 'e2e/visual3d.spec.ts', '--reporter=line']))
}

// ---------- perf на production-сборке ----------
let perf = null
const buildOk = steps.find((s) => s.name === 'build')?.ok
if (buildOk && !SKIP_E2E) {
  process.stdout.write('▶ perf… ')
  const port = 5191
  const srv = spawn('npx', ['vite', 'preview', '--outDir', `${OUT}/dist`, '--port', String(port), '--strictPort'], { shell: isWin, stdio: 'ignore' })
  try {
    const { chromium } = await import('@playwright/test')
    await new Promise((r) => setTimeout(r, 3000))
    // GPU-флаги: без них headless рисует программно (SwiftShader) и FPS занижен в ~6 раз
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await page.goto(`http://localhost:${port}/?perf`)
    await page.click('[data-testid=enter-button]')
    const sample = () =>
      page.evaluate(() => ({
        heapMB: Math.round(((performance).memory?.usedJSHeapSize ?? 0) / 1048576 * 10) / 10,
        dom: document.getElementsByTagName('*').length,
      }))
    await page.waitForTimeout(5000)
    const start = await sample()
    // FPS за 5 с
    const fps = await page.evaluate(
      () =>
        new Promise((res) => {
          let n = 0
          const t0 = performance.now()
          const f = () => (performance.now() - t0 < 5000 ? (n++, requestAnimationFrame(f)) : res(Math.round((n / 5) * 10) / 10))
          requestAnimationFrame(f)
        }),
    )
    await page.waitForTimeout(55_000) // ≈ 1 игровой час
    const end = await sample()
    await page.mouse.click(10, 10) // INP требует взаимодействия
    await page.waitForTimeout(500)
    const vitals = await page.evaluate(() => (window).__vitals ?? {})
    await browser.close()
    perf = { start, end, fps, vitals, errors }
    console.log('OK')
  } catch (e) {
    perf = { error: String(e) }
    console.log('FAIL')
  } finally {
    if (isWin) spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'])
    else srv.kill()
  }
}

// ---------- отчёт ----------
let coverage = ''
const covFile = path.join(OUT, 'coverage', 'coverage-summary.json')
if (existsSync(covFile)) {
  const t = JSON.parse(readFileSync(covFile, 'utf8')).total
  coverage = `Lines ${t.lines.pct}% · Statements ${t.statements.pct}% · Functions ${t.functions.pct}% · Branches ${t.branches.pct}%`
}
const failed = steps.filter((s) => !s.ok && !s.optional)
const lines = [
  `# QA REPORT — MOSCOW LIFE`,
  `Дата: ${new Date().toISOString()}  ·  Итог: **${failed.length ? `FAIL (${failed.map((s) => s.name).join(', ')})` : 'PASS'}**`,
  '',
  '| Шаг | Результат | Время |',
  '|---|---|---|',
  ...steps.map((s) => `| ${s.name} | ${s.ok ? '✅' : '❌'} | ${s.sec}s |`),
  '',
  coverage && `**Покрытие unit-тестами:** ${coverage}`,
  '',
  '## Performance (production preview, 1600×900)',
  perf
    ? perf.error
      ? `Ошибка замера: ${perf.error}`
      : [
          `- FPS (rAF, 5 с): **${perf.fps}**`,
          `- JS heap: ${perf.start.heapMB} МБ → ${perf.end.heapMB} МБ за ~1 игровой час`,
          `- DOM-узлов: ${perf.start.dom} → ${perf.end.dom}`,
          `- Web Vitals: ${Object.entries(perf.vitals).map(([k, v]) => `${k}=${v.value} (${v.rating})`).join(', ') || 'нет данных'}`,
          `- Ошибки консоли: ${perf.errors.length ? perf.errors.slice(0, 5).join('; ') : 'нет'}`,
        ].join('\n')
    : 'пропущено',
  '',
  '## Не автоматизировано (проверить вручную / агентами)',
  '- Звук на слух: щелчки, баланс, клиппинг — `node scripts/audio-meter.mjs` + прослушивание (skill moscow-audio-engineering)',
  '- Многочасовая стабильность и фон/freeze — skill long-session-stability',
  '- Субъективное качество — агенты visual-art-director и user-simulator',
  '',
  '## Хвосты логов упавших шагов',
  ...(failed.length ? failed.map((s) => `### ${s.name}\n\`\`\`\n${s.tail}\n\`\`\``) : ['—']),
  '',
  `Полные логи: ${OUT}/*.log`,
]
writeFileSync(path.join(OUT, 'QA_REPORT.md'), lines.filter((l) => l !== false).join('\n'))
console.log(`\nОтчёт: ${OUT}/QA_REPORT.md`)
process.exit(failed.length ? 1 : 0)
