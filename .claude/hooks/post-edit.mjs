// PostToolUse(Edit|Write): быстрый lint изменённого файла (Biome, ~50 мс) + пометка "есть изменения" для Stop-хука.
// TypeScript-проверку здесь не запускаем (3+ с на правку) — её делает Stop-хук один раз в конце хода.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { readInput, rel, markDirty, ROOT } from './lib.mjs'

const ti = readInput().tool_input || {}
const file = rel(ti.file_path)
if (!file || !/^(src|e2e|scripts)\/.+\.(tsx?|mjs|js|css)$/.test(file)) process.exit(0)

markDirty()

const bin = path.join(ROOT, 'node_modules', '@biomejs', 'biome', 'bin', 'biome')
const r = spawnSync(process.execPath, [bin, 'lint', '--diagnostic-level=error', '--max-diagnostics=15', '--colors=off', file], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 20000,
})
if (r.status !== 0 && r.status !== null) {
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(0, 60).join('\n')
  process.stderr.write(`Biome lint: ошибки в ${file}. Исправьте:\n${out}\n`)
  process.exit(2)
}
process.exit(0)
