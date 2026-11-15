# MOSCOW LIFE — инструкции для Claude
Бесконечная LoFi-симуляция жизни Москвы: иллюстрированная сцена, процедурная музыка, погода, герой живёт по расписанию.
Сначала читай `PROGRESS.md` (краткий журнал, веди его коротко). Не перечитывай `promt.md` без нужды.

## Стек и архитектура
Vite 8 + React 19 + TypeScript 7 + Tailwind 4 + zustand + framer-motion (только UI) + Tone.js 15. Тесты: Vitest + Testing Library, Playwright (+ axe). Линт/формат: Biome (ESLint несовместим с TS 7).
- `src/data` (локации) → `src/simulation` (сценарии, переходы) → `src/stores` (worldStore, audioStore) → UI (`src/components`, `src/scenes`). Зависимости однонаправленные.
- `src/audio` — звук; связь с миром только через stores и `utils/eventBus`.
- Сцена: SVG 1600×900 (`xMidYMax slice`) + canvas погоды + CSS-анимации сущностей. Свет/погода — CSS-переменные (LightingController), без ререндера.

## Команды
- `npm run dev` (5173) · `npm run build` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run e2e`
- `npm run verify` — typecheck + lint + unit + build (перед сдачей этапа)
- `npm run e2e:visual` / `e2e:update-snapshots` · `npm run e2e:a11y` · `npm run qa` → единый отчёт `D:/dev-cache/tmp/qa/QA_REPORT.md`
- Скриншоты сцен: `node scripts/shots.mjs` → D:/dev-cache/tmp/shots (нужен dev-сервер). Звук: `node scripts/audio-meter.mjs`
- Dev-хуки: `window.__ml(location, weather, minutes)`, `window.__audio` (dev / `?audiodebug`), `window.__vitals` (dev / `?perf`)

## Правила
- Картинки — процедурные SVG (`src/scenes/art`), внешних ассетов нет; любой новый ассет — по `ASSET_PIPELINE.md`.
- Локации — только данные в `src/data/locations.ts`. Без телепортов: переходы через `planTravel`.
- Один AudioContext (через Tone). Не подключать PixiJS/Three.js без замеров; никогда обе.
- Никаких заглушек и пустых кнопок. Функцию не называть рабочей без проверки. «Замерено» ≠ «прослушано».
- Секреты не в клиентском коде и не в `VITE_*`. Новые зависимости — только после проверки (хук спросит).
- Перед использованием малознакомого API — Context7 / modern-web-guidance, сверяя версию из package.json.

## Агенты и skills
Workflow, роли и приёмка — `DEVELOPMENT_WORKFLOW.md`. Инструменты, плагины, MCP, хуки — `CLAUDE_TOOLS.md`.
Агенты (`.claude/agents`): architect (координатор), frontend, audio-engineer, graphics-engineer, world-simulation-engineer, browser-performance-engineer, qa-engineer, visual-art-director, user-simulator, security-reviewer.
Skills (`.claude/skills`): moscow-audio-engineering (любая работа со звуком), moscow-visual-art-direction, moscow-city-simulation, long-session-stability, moscow-visual-qa, moscow-asset-pipeline.

## Тестирование
Хуки: lint изменённого файла после правки; typecheck + unit в конце хода, если менялся код. Перед завершением крупного этапа: `npm run verify`, затем `npm run qa` и `/code-review`. Чеклист — `QA_CHECKLIST.md`.
