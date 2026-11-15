// Сравнение двух heap-снимков (после GC) на изолированной сборке: какие конструкторы растут.
//   node scripts/soak-heapdiff.mjs [warmMin=2] [gapMin=8] [--port 5195] [--query "?audiodebug"] [--no-server]
// Вывод: топ роста по (тип, имя) — число объектов и self size; плюс retainer-цепочки для лидера.
import { spawn, spawnSync } from 'node:child_process'
import { chromium } from '@playwright/test'

const argv = process.argv.slice(2)
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d)
const nums = argv.filter((a) => /^\d+(\.\d+)?$/.test(a)).map(Number)
const WARM = nums[0] ?? 2
const GAP = nums[1] ?? 8
const PORT = Number(opt('--port', 5197))
const DIST = opt('--dist', 'D:/dev-cache/tmp/mlsoak')
const QUERY = opt('--query', '?audiodebug')
const isWin = process.platform === 'win32'

let srv = null
if (!argv.includes('--no-server')) {
  srv = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { shell: isWin, stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 3500))
}
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const cdp = await page.context().newCDPSession(page)
await page.goto(`http://localhost:${PORT}/${QUERY}`)
await page.click('[data-testid=enter-button]')

async function snapshot() {
  await cdp.send('HeapProfiler.enable')
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  const chunks = []
  const onChunk = (e) => chunks.push(e.chunk)
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk)
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false })
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk)
  return JSON.parse(chunks.join(''))
}

function aggregate(snap) {
  const m = snap.snapshot.meta
  const F = m.node_fields.length
  const types = m.node_types[0]
  const iType = m.node_fields.indexOf('type')
  const iName = m.node_fields.indexOf('name')
  const iSize = m.node_fields.indexOf('self_size')
  const agg = new Map()
  const n = snap.nodes
  for (let i = 0; i < n.length; i += F) {
    const t = types[n[i + iType]]
    const name = t === 'string' || t === 'concatenated string' || t === 'sliced string' ? '(string)' : t === 'number' ? '(number)' : snap.strings[n[i + iName]].slice(0, 80)
    const k = `${t}::${name}`
    const a = agg.get(k) ?? { count: 0, size: 0 }
    a.count++
    a.size += n[i + iSize]
    agg.set(k, a)
  }
  return agg
}

const wait = (min) => page.waitForTimeout(min * 60000)
await wait(WARM)
const A = aggregate(await snapshot())
const hA = (await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)) / 1048576
await wait(GAP)
const B = aggregate(await snapshot())
const hB = (await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)) / 1048576

const rows = []
for (const [k, b] of B) {
  const a = A.get(k) ?? { count: 0, size: 0 }
  rows.push({ k, dCount: b.count - a.count, dSize: b.size - a.size, count: b.count })
}
rows.sort((x, y) => y.dSize - x.dSize)
console.log(`heap(performance.memory) ${hA.toFixed(1)} → ${hB.toFixed(1)} МБ за ${GAP} мин`)
console.log('top по росту self size:')
for (const r of rows.slice(0, 30)) console.log(`${(r.dSize / 1024).toFixed(0).padStart(8)} KB  ${String(r.dCount).padStart(8)} obj  (всего ${r.count})  ${r.k}`)
rows.sort((x, y) => y.dCount - x.dCount)
console.log('top по росту числа объектов:')
for (const r of rows.slice(0, 20)) console.log(`${String(r.dCount).padStart(8)} obj  ${(r.dSize / 1024).toFixed(0).padStart(8)} KB  ${r.k}`)
await browser.close()
if (srv) {
  if (isWin) spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'])
  else srv.kill()
}
