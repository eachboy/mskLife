// PreToolUse: защита проекта (удаление важных файлов, секреты, ассеты, зависимости, конфиги).
import { existsSync } from 'node:fs'
import path from 'node:path'
import { readInput, rel, decide, ROOT } from './lib.mjs'

const input = readInput()
const tool = input.tool_name || ''
const ti = input.tool_input || {}

// ---------- Shell ----------
if (tool === 'Bash' || tool === 'PowerShell') {
  const cmd = String(ti.command || '')
  const PROTECTED = /(^|[\s"'\/\\])(src|\.claude|public|e2e|scripts|setting|assets|docs|PROGRESS\.md|CLAUDE\.md|package(-lock)?\.json|\.git)([\s"'\/\\]|$)|(^|\s)(\.|\*|\/|~)(\s|$)/
  const isDelete =
    /\brm\s+(-[a-zA-Z]*\s+)*/.test(cmd) ||
    /\b(Remove-Item|rmdir|rd|del|erase)\b/i.test(cmd) ||
    /\bfind\b.*-delete\b/.test(cmd)
  if (isDelete && PROTECTED.test(cmd)) {
    decide('deny', 'Защита проекта: удаление исходников/конфигов/документации заблокировано хуком. Если это действительно нужно — попросите пользователя выполнить команду вручную.')
  }
  if (/\bgit\s+(push\s+.*--force|push\s+-f\b|reset\s+--hard|clean\s+-[a-z]*f)/.test(cmd)) {
    decide('ask', 'Необратимая git-операция — требуется подтверждение пользователя.')
  }
  // Новые зависимости: npm i <pkg>, npm install -D <pkg>, pnpm/yarn add <pkg>
  const m = cmd.match(/\b(?:npm\s+(?:i|install|add)|pnpm\s+add|yarn\s+add)\b([^;&|]*)/)
  if (m) {
    const pkgs = m[1].trim().split(/\s+/).filter((t) => t && !t.startsWith('-'))
    if (pkgs.length) {
      decide('ask', `Установка новых зависимостей (${pkgs.join(', ')}). Проверьте: нужна ли она, нет ли дубля в package.json, репутация/лицензия/последний релиз, не создаёт ли второй AudioContext.`)
    }
  }
  if (/\b(curl|wget|iwr|Invoke-WebRequest|irm)\b.*\|\s*(sh|bash|iex|node|python)/i.test(cmd)) {
    decide('deny', 'Запуск удалённого скрипта без просмотра запрещён. Скачайте файл, изучите, затем запускайте.')
  }
  process.exit(0)
}

// ---------- File writes ----------
if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
  const file = rel(ti.file_path || ti.notebook_path)
  if (!file) process.exit(0)
  const text = [ti.content, ti.new_string, ...(ti.edits || []).map((e) => e.new_string)].filter(Boolean).join('\n')

  const SECRET = [
    /sk-ant-[A-Za-z0-9_-]{20,}/,
    /\bsk-[A-Za-z0-9]{32,}/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9]{36}/,
    /github_pat_[A-Za-z0-9_]{40,}/,
    /xox[abpr]-[A-Za-z0-9-]{10,}/,
    /AIza[0-9A-Za-z_-]{35}/,
  ]
  if (SECRET.some((r) => r.test(text))) {
    decide('deny', 'Похоже на секрет/API-ключ в содержимом файла. Секреты храните только в .env (в .gitignore), в репозиторий и клиентский код не помещайте.')
  }

  const base = path.posix.basename(file)
  if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') {
    decide('ask', 'Запись в файл окружения с секретами. Подтвердите вручную.')
  }
  if (/^\.env/.test(base) && /VITE_[A-Z0-9_]*(SECRET|PRIVATE|TOKEN|PASSWORD)/.test(text)) {
    decide('deny', 'Переменные VITE_* попадают в клиентский бандл. Секрет с префиксом VITE_ будет опубликован — используйте серверный прокси.')
  }

  // Ассеты: не перезаписывать исходники без сохранения.
  const abs = path.join(ROOT, file)
  if (/^assets\/source\//.test(file) && existsSync(abs)) {
    decide('deny', 'assets/source — исходники ассетов, только добавление новых версий (name.v2.ext), без перезаписи.')
  }
  if (/^(public|assets)\//.test(file) && /\.(png|jpe?g|webp|avif|gif|svg|mp3|ogg|wav|flac|woff2?|ttf)$/i.test(file) && existsSync(abs)) {
    decide('ask', `Перезапись существующего ассета ${file}. Убедитесь, что исходник сохранён в assets/source.`)
  }

  // Неконтролируемое изменение конфигурации.
  const CONFIG = /^(package\.json|vite\.config\.ts|tsconfig\.json|biome\.json|playwright\.config\.ts|index\.html|\.claude\/settings(\.local)?\.json|\.claude\/hooks\/.+|\.gitignore)$/
  if (CONFIG.test(file)) {
    decide('ask', `Изменение конфигурации проекта (${file}). Подтвердите, что это осознанное изменение.`)
  }
}
process.exit(0)
