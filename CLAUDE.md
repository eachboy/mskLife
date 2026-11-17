# MOSCOW LIFE (mskLife) — инструкции для Claude
Бесконечная LoFi-симуляция жизни Москвы: процедурная музыка, погода, герой живёт по расписанию. С 16.11.2026 проект пересматривается в сторону **3D-города с кинематографичной графикой**; **единственный рендер — 3D (решение 17.11.2026), SVG-рендер удалён**, запасного режима и `renderMode` нет.
Сначала читай `PROGRESS.md` (краткий журнал, веди его коротко). Не перечитывай `promt.md` без нужды.

## План развития и спецификации (все документы — в `docs/`; читать раздел под задачу, не целиком)
Текущая стадия — в `docs/stages.md` (S0–S9, критерии готовности). Промты запуска стадий — `docs/promts.md`. Стадии идут по порядку.
- `docs/CINEMATIC_3D_PLAN.md` — **главный документ графики**: стек и точные версии, архитектура `src/world3d`, город из OSM, свет, материалы, постобработка, камера, ворота, **бюджеты 3D (§9)**.
- `docs/ASSET_GENERATION_3D.md` — что генерировать и где; приём ассетов.
- `docs/REALTIME_TRANSIT_AND_MOVEMENT_SPEC.md` — часы симуляции, режимы 1:1 / 5× / 15× / 60×, метры и секунды, светофоры, постанционный проезд.
- `docs/BUGFIX_AND_OPTIMIZATION_AUDIT.md` — находки B-01…, фоновый режим, память, звук, **единые бюджеты (§6)**.
- `docs/SONNET_DEVELOPMENT_TOOLKIT.md` — правила работы модели, MCP, ворота качества (§3.4).
- `docs/TRANSITION_TO_3D_AND_KINEMATICS.md` — устарел в части §1.3, §1.4, §2 (low-poly без ассетов); действует только там, где не противоречит `CINEMATIC_3D_PLAN.md`. `docs/MASTER_EXECUTION_ROADMAP.md` — история Фаз 1–6; незакрытый хвост Фазы 1 — стадия S0.

## Правила работы для моделей уровня Sonnet
1. Один шаг — не больше 3 файлов исходников; цикл: прочитать файлы → проверить инварианты → написать → запустить команду проверки.
2. Числа, формулы и бюджеты — только из спецификаций; API библиотек — только через Context7 с версией из `package.json`.
3. Типы, сторы и `eventBus` меняет architect до раздачи задач; агент правит только файлы своей зоны (`.claude/agents/*.md`).
4. `ScenarioEvent.duration` — игровые минуты; реальные секунды — только `eventRealSeconds`; литерал 60 как масштаб времени запрещён.
5. В React не подписываться на значения, меняющиеся чаще 1 Гц; `useWorldStore()` / `useAudioStore()` без селектора запрещены.
6. Покадровый код: только `useFrame` внутри единственного `<Canvas>` (CSS-анимации сущностей и SVG-сцены запрещены — рендера кроме 3D нет), ноль аллокаций, полная остановка в скрытой вкладке (0 draw calls). Симуляция и звук в фоне не останавливаются и от способа отрисовки не зависят.
7. Отчёт: файлы · команды и их вывод · цифры до/после · что не проверено. Без вывода команд работа не принимается.
8. Стоп и доклад, если: проверка красная после двух исправлений, нужна зависимость или правка конфига, документ расходится с кодом.

## Стек и архитектура
Vite 8 + React 19 + TypeScript 7 + Tailwind 4 + zustand + framer-motion (только UI) + Tone.js 15. 3D (со стадии S1, точные версии — `docs/CINEMATIC_3D_PLAN.md` §2): three 0.187 + @react-three/fiber 9 + drei 10 + postprocessing 6. Тесты: Vitest + Testing Library, Playwright (+ axe). Линт/формат: Biome (ESLint несовместим с TS 7).
- `src/data` (локации) → `src/simulation` (сценарии, переходы) → `src/stores` (worldStore, audioStore) → UI (`src/components`, `src/scenes`). Зависимости однонаправленные.
- `src/audio` — звук; связь с миром только через stores и `utils/eventBus`.
- 3D-мир: `src/world3d` — единственный `<Canvas>`, ленивый чанк; читает сторы и `simClock`, в `worldStore` не пишет. Свет/погода — uniforms через `light/worldLight.ts`, без ререндера React.
- Рендера кроме 3D нет: `SceneStage` монтирует только ленивый `World3D` + виньетку/зерно. Без WebGL2 — экран с пояснением (S8), не SVG. Интерьеры до S7 — временное решение, `docs/stages.md` (S7).

## Команды
- `npm run dev` (5173) · `npm run build` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run e2e`
- `npm run verify` — typecheck + lint + unit + build (перед сдачей этапа)
- `npm run e2e:visual` / `e2e:update-snapshots` · `npm run e2e:a11y` · `npm run qa` → единый отчёт `D:/dev-cache/tmp/qa/QA_REPORT.md`
- Скриншоты сцен: `node scripts/shots.mjs` → D:/dev-cache/tmp/shots (нужен dev-сервер). Звук: `node scripts/audio-meter.mjs`
- Dev-хуки: `window.__ml(location, weather, minutes)`, `window.__audio` (dev / `?audiodebug`), `window.__vitals` (dev / `?perf`)

## Правила
- Ассеты 3D (`.glb` meshopt, `.ktx2`, тайлы города) — только из репозитория (`public/`), с исходником в `assets/source` и строкой в `docs/ASSET_MANIFEST.md`; порядок — `docs/ASSET_PIPELINE.md`, список — `docs/ASSET_GENERATION_3D.md`. Нет ассета — шаг не начинается, заглушек нет.
- Локации — только данные в `src/data/locations.ts`. Без телепортов: переходы через `planTravel`.
- Один AudioContext (через Tone). Один WebGL-контекст. Пакеты 3D — только из перечня `docs/CINEMATIC_3D_PLAN.md` §2, точными версиями, через ворота §8 (карточка security-reviewer, подтверждение пользователя, прототип-замер); `three` не выше 0.187.x. Three и R3F импортируются только в `src/world3d`. PixiJS, `gsap`, `framer-motion-3d`, тайлы Google не подключать.
- Никаких заглушек и пустых кнопок. Функцию не называть рабочей без проверки. «Замерено» ≠ «прослушано».
- Секреты не в клиентском коде и не в `VITE_*`. Новые зависимости — только после проверки (хук спросит).
- Перед использованием малознакомого API — Context7 / modern-web-guidance, сверяя версию из package.json.

## Агенты и skills
Workflow, роли и приёмка — `docs/DEVELOPMENT_WORKFLOW.md`. Инструменты, плагины, MCP, хуки — `docs/CLAUDE_TOOLS.md`.
Агенты (`.claude/agents`, модель sonnet, у каждого — зона файлов, инварианты, бюджеты, чеклист): architect (координатор), graphics-engineer (весь `src/world3d`), asset-pipeline-engineer (запекание города из OSM, приём и сжатие ассетов), frontend, audio-engineer, world-simulation-engineer, browser-performance-engineer, qa-engineer, visual-art-director, user-simulator, security-reviewer.
Skills (`.claude/skills`): moscow-audio-engineering (любая работа со звуком), moscow-visual-art-direction, moscow-city-simulation, long-session-stability, moscow-visual-qa, moscow-asset-pipeline.

## Тестирование
Хуки: lint изменённого файла после правки; typecheck + unit в конце хода, если менялся код. Перед завершением крупного этапа: `npm run verify`, затем `npm run qa` и `/code-review`. Чеклист — `docs/QA_CHECKLIST.md`.
