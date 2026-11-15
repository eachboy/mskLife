// Stop: если в этом ходе менялся код — typecheck + unit-тесты. Падение -> Claude продолжает и чинит.
// Защита от цикла: при stop_hook_active (повторная остановка после блокировки) не блокируем.
import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'
import { readInput, isDirty, clearDirty, ROOT } from './lib.mjs'

const input = readInput()
if (!isDirty()) process.exit(0)
if (input.stop_hook_active) {
  process.stdout.write(JSON.stringify({ systemMessage: 'stop-verify: проверка всё ещё не проходит — см. вывод выше.' }))
  process.exit(0)
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
function run(args, timeout) {
  const r = spawnSync(npx, args, { cwd: ROOT, encoding: 'utf8', timeout, shell: process.platform === 'win32' })
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` }
}

const failures = []
const tsc = run(['tsc', '-b', '--noEmit'], 120000)
if (!tsc.ok) failures.push(`TypeScript:\n${tsc.out.trim().split('\n').slice(0, 40).join('\n')}`)
const test = run(['vitest', 'run', '--reporter=dot'], 150000)
if (!test.ok) {
  const lines = test.out.trim().split('\n')
  failures.push(`Vitest:\n${lines.filter((l) => /FAIL|Error|expected|✗|×|Tests /.test(l)).slice(0, 40).join('\n') || lines.slice(-30).join('\n')}`)
}

if (failures.length) {
  process.stderr.write(`Проверка перед завершением не прошла. Исправьте или явно сообщите пользователю:\n\n${failures.join('\n\n')}\n`)
  process.exit(2)
}

clearDirty()
let note = 'stop-verify: typecheck + unit-тесты ОК.'
try {
  const progress = statSync(path.join(ROOT, 'PROGRESS.md')).mtimeMs
  if (Date.now() - progress > 30 * 60 * 1000) note += ' PROGRESS.md давно не обновлялся.'
} catch {}
process.stdout.write(JSON.stringify({ systemMessage: note }))
process.exit(0)
