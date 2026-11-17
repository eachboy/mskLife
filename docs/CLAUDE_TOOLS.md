# CLAUDE_TOOLS — инструменты Claude Code для MOSCOW LIFE
Состояние на 2026-11-15, Claude Code 2.1.325. Проверка: `/plugin`, `/mcp`, `/hooks`, `/agents`.

## Плагины (marketplace `claude-plugins-official`, scope: user; включены в `.claude/settings.json`)
| Плагин | Версия | Автор | Зачем в проекте | Как вызывать |
|---|---|---|---|---|
| frontend-design | 1.1.1 | Anthropic | Визуальная система UI, типографика, без шаблонного AI-дизайна | skill `frontend-design:frontend-design` |
| superpowers | 7.0.2 | Anthropic-верифицирован | Systematic debugging, TDD, brainstorming, планы, subagent-driven development | skills `superpowers:*` |
| context7 | — | Upstash (MCP) | Актуальная документация React/Vite/TS/Tailwind/Tone.js/Playwright | MCP `resolve-library-id`, `query-docs` |
| playwright | — | Microsoft (MCP) | Интерактивный браузер: сценарии, скриншоты, разрешения | MCP `browser_*` |
| chrome-devtools-mcp | 1.11.0 | Google Chrome | Trace, heap snapshot, Lighthouse, console, network | MCP `chrome-devtools__*`, skills `chrome-devtools-mcp:*` |
| code-review | — | Anthropic | Ревью PR несколькими агентами | `/code-review:code-review` (для PR на GitHub) |
| code-simplifier | — | Anthropic | Упрощение кода без изменения поведения | агент `code-simplifier` |
| modern-web-guidance | 0.0.194 | Google Chrome | Актуальные веб-API, CSS, производительность, Page Lifecycle | skill `modern-web-guidance:modern-web-guidance` |
| security-guidance | 2.0.20 | Anthropic | Предупреждения на опасные паттерны при правках; LLM-ревью диффа на Stop и на git commit | автоматически (хуки плагина) |
| claude-code-setup | — | Anthropic | Рекомендации по автоматизациям | skill `claude-code-setup:claude-automation-recommender` |
| skill-creator | — | Anthropic | Создание/оценка/оптимизация skills | skill `skill-creator:skill-creator` |
| figma | 2.2.157 | Figma (MCP) | Дизайн-система, макеты UI, design↔code | MCP `figma__*`, skills `figma:*` |

Встроенные в Claude Code (не плагины): `/code-review` (ревью локального диффа), `/simplify`, `/security-review`.

Уже были установлены и к проекту не относятся: `vercel` (нужен bun, MCP требует авторизации — не используется), `gopls-lsp`, `rust-analyzer-lsp`, `ui-ux-pro-max` (сторонний маркетплейс; пересекается с frontend-design — предпочитать frontend-design), synced `design`.

**Не установлено:** `github` — проект не git-репозиторий и не размещён на GitHub; ставить после `git init` + remote: `claude plugin install github@claude-plugins-official` (потребует GitHub-токен/OAuth).

### Замечания по безопасности плагинов
- `security-guidance`: на SessionStart ставит Python-пакет Claude Agent SDK в собственное окружение плагина; на Stop отправляет **git-дифф** в Claude API (вашим аккаунтом) — без git-репозитория LLM-ревью не работает, остаются только паттерн-предупреждения. Требует Python 3.8+ (есть 3.13).
- `modern-web-guidance`: только skills (markdown + локальный поисковый скрипт), хуков и сети нет.
- `chrome-devtools-mcp`, `playwright`: запускаются через `npx` (пакеты npm: `chrome-devtools-mcp@1.11.0` закреплён, `@playwright/mcp@latest` — плавающая версия). Имеют полный доступ к открываемым ими браузерам.

## MCP-серверы
| Сервер | Назначение | Разрешения | Доверие | Авторизация | Задачи проекта |
|---|---|---|---|---|---|
| context7 | Документация библиотек | Чтение публичной документации; отправляет текст запроса | Высокое (официальный, open source) | OAuth выполнен (`/mcp`) | API Tone.js, Web Audio, Vite, Playwright |
| playwright | Управление браузером | Локальный Chromium, навигация, JS в странице | Высокое (Microsoft) | Не нужна | E2E-сценарии, скриншоты, адаптивность |
| chrome-devtools | Диагностика браузера | Локальный Chrome, CDP: трейсы, heap, сеть | Высокое (Google) | Не нужна | Производительность, утечки, Lighthouse |
| figma | Дизайн ↔ код | Чтение/запись в ваши Figma-файлы | Высокое (Figma) | OAuth выполнен (`/mcp`) | UI-макеты, токены, иконки |
| claude.ai Gmail / Calendar / Drive / Docs | Коннекторы аккаунта claude.ai | Доступ к почте/календарю/диску | — | Подключены на уровне аккаунта | **Проекту не нужны**; агентам не использовать |
| vercel, design:slack/linear/atlassian/notion/intercom | Из сторонних для проекта плагинов | — | — | Не авторизованы | Не нужны, не авторизовывать |

## Skills проекта (`.claude/skills`)
| Skill | Когда срабатывает |
|---|---|
| moscow-audio-engineering | Любая работа со звуком: щелчки, клиппинг, темп, инструменты, AudioContext |
| moscow-visual-art-direction | Любое видимое изменение сцены; Style Guide и право вето |
| moscow-city-simulation | src/simulation, локации, переходы, расписание, погода-логика |
| long-session-stability | Утечки, фон, freeze/resume, многочасовые сессии |
| moscow-visual-qa | Скриншоты, матрица условий, визуальная регрессия |
| moscow-asset-pipeline | Добавление/генерация/лицензии ассетов |

## Subagents (`.claude/agents`)
architect · frontend · audio-engineer · graphics-engineer · world-simulation-engineer · browser-performance-engineer · qa-engineer · visual-art-director (только чтение + Bash) · user-simulator (только чтение + Bash) · security-reviewer (только чтение + Bash). Роли и порядок — `DEVELOPMENT_WORKFLOW.md`.

## Hooks (`.claude/settings.json`, скрипты в `.claude/hooks/`, Node, без сети)
| Событие | Скрипт | Что делает | Время |
|---|---|---|---|
| PreToolUse (Bash/PowerShell/Write/Edit) | guard.mjs | **deny**: удаление src/.claude/public/e2e/scripts/setting/assets/доков/package*.json; секреты (sk-ant, sk-, AKIA, ghp_, AIza, private key) в файлах; `VITE_*SECRET/TOKEN` в .env; перезапись `assets/source/*`; `curl … \| sh`. **ask**: установка новых npm-пакетов; правка конфигов (package.json, vite/ts/biome/playwright config, index.html, .gitignore, .claude/settings*, .claude/hooks); запись в `.env*`; перезапись ассетов в public/; `git push --force`, `reset --hard`, `clean -f` | < 100 мс |
| PostToolUse (Write/Edit) | post-edit.mjs | Biome lint изменённого файла src/e2e/scripts (только ошибки → Claude исправляет); помечает «код менялся» | ~0.3 с |
| Stop | stop-verify.mjs | Если код менялся: `tsc -b` + `vitest run`; при падении — Claude продолжает и чинит (один раз, `stop_hook_active` защищает от цикла) | ~12 с, только после правок |

Permissions: разрешены без вопросов `npm run *`, `npx tsc|vitest|biome|playwright test`, `node scripts/*`; запрещено читать `.env`, `.env.*` (побочный эффект: `.env.example` тоже нельзя править инструментом Write — правьте вручную).

## npm-инструменты (добавлены)
| Пакет | Зачем |
|---|---|
| @biomejs/biome (dev) | Lint + format; ESLint/typescript-eslint не поддерживают TypeScript 7 |
| @vitest/coverage-v8 (dev) | Покрытие unit-тестов (`npm run test:coverage`) |
| @testing-library/user-event (dev) | Реалистичные взаимодействия в компонентных тестах |
| @axe-core/playwright (dev) | Accessibility-аудит (`npm run e2e:a11y`) |
| web-vitals | Метрики LCP/CLS/INP/FCP/TTFB в dev или `?perf` → `window.__vitals` |

Уже были: @playwright/test, vitest, @testing-library/react, @testing-library/jest-dom, tone.
**Сознательно не добавлены**: pixi.js/@pixi/react (SVG-рендер работает, замены без замеров нет), three.js, sharp (нет растровых ассетов — добавить с первым), zod (нет внешнего ввода, кроме ответа Open-Meteo), lighthouse (есть в chrome-devtools MCP), vite-plugin-pwa (см. рекомендации в отчёте/PROGRESS).

## Команды
См. `CLAUDE.md` → «Команды».
