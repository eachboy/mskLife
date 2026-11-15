// Общие утилиты хуков MOSCOW LIFE. Хуки должны быть быстрыми и без сетевых вызовов.
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'

export const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd()
export const STATE_DIR = path.join(ROOT, '.claude', '.state')
export const DIRTY_FLAG = path.join(STATE_DIR, 'dirty')

export function readInput() {
  try {
    const raw = readFileSync(0, 'utf8')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** Путь относительно корня проекта, со слэшами `/`. Вне проекта — null. */
export function rel(p) {
  if (!p) return null
  const r = path.relative(ROOT, path.resolve(ROOT, p)).split(path.sep).join('/')
  return r.startsWith('..') || path.isAbsolute(r) ? null : r
}

export function decide(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
    }),
  )
  process.exit(0)
}

export function markDirty() {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(DIRTY_FLAG, String(Date.now()))
}
export const isDirty = () => existsSync(DIRTY_FLAG)
export const clearDirty = () => rmSync(DIRTY_FLAG, { force: true })
