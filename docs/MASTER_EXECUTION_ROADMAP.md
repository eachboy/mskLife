# MASTER EXECUTION ROADMAP — шесть фаз и готовые промты

Как пользоваться: фазы идут строго по порядку; следующая не начинается, пока не выполнены **все** критерии готовности предыдущей. Блок «Промт» копируется в новый сеанс Claude Sonnet целиком. Сеанс ведёт главный поток в роли architect и вызывает агентов из `.claude/agents/`.

Документы-источники: `REALTIME_TRANSIT_AND_MOVEMENT_SPEC.md` (RT), `TRANSITION_TO_3D_AND_KINEMATICS.md` (3D), `BUGFIX_AND_OPTIMIZATION_AUDIT.md` (BA), `SONNET_DEVELOPMENT_TOOLKIT.md` (TK).

| Фаза | Название | Ведёт | Новые зависимости |
|---|---|---|---|
| 1 | Стабильность и фоновый режим | browser-performance-engineer + world-simulation-engineer | нет |
| 2 | Реальное время и микро-фазы пути | world-simulation-engineer | нет |
| 3 | Кинематика и живые сцены | graphics-engineer | нет |
| 4 | 3D-карта Москвы | graphics-engineer | `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three` |
| 5 | Camera Dive, непрерывные переходы, акустика пространств | graphics-engineer + audio-engineer | нет |
| 6 | Полировка, 8-часовой прогон, релиз | qa-engineer + architect | нет |

Общие правила всех фаз:
- Шаг агента — не больше 3 файлов исходников; после шага — ворота из TK §3.4.
- Типы, сторы, `eventBus` меняет только architect и **до** раздачи задач.
- Конец фазы: `npm run qa`, `/code-review`, запись в `PROGRESS.md` (одна–три строки с цифрами).
- Эталоны `e2e:visual` обновляются только после вердикта visual-art-director.
- Пользователь вручную удаляет временные файлы `scripts/_*.tmp.mjs` (хук блокирует удаление агентом).

---

## Фаза 1. Стабильность и фоновый режим

**Цель:** скрытая вкладка не тратит GPU и почти не тратит CPU; симуляция и звук идут точно; возврат после любого простоя — без потерь и «лавины». Закрываются находки BA: B-01, B-03 (временно), B-04…B-09, B-11…B-15, B-17, B-18, B-20, B-21.

**Файлы**

| Действие | Файл | Кто |
|---|---|---|
| создать | `scripts/bg-cpu.mjs` | browser-performance-engineer |
| изменить | `src/types/index.ts` (`TimeMode`, `silent?: boolean` в событии), `src/stores/worldStore.ts` (`timeMode`), `src/utils/eventBus.ts` (`silent` в `'travel-state'`) | architect |
| создать | `src/simulation/time/simClock.ts`, `eventProgress.ts`, `ticker.worker.ts`, `src/simulation/__tests__/simClock.test.ts` | world-simulation-engineer |
| изменить | `src/simulation/engine/ScenarioEngine.ts` (RT §1.3–1.5; масштаб остаётся 60, но через `clock.scale`) | world-simulation-engineer |
| изменить | `src/audio/core/AudioLifecycleManager.ts` (`travelInput` в секундах, `silent`), `src/audio/engine/AudioMixer.ts` (B-11), `src/audio/engine/TravelSoundEngine.ts` (`silent`) | audio-engineer |
| изменить | `src/features/city/useHeroGeo.ts`, `CityMapHub.tsx`, `LocationCard.tsx`, `src/components/controls/Panels.tsx`, `BottomBar.tsx`, `src/components/player/Visualizer.tsx` | frontend |
| изменить | `src/features/city/CityMap25D.tsx` (маячок и радар от `getEventProgress`), `LightingController.tsx`, `EntityLayer.tsx` (временная мера B-05), `src/features/characters/Hero.tsx` (временная мера B-03), `src/features/weather/WeatherRenderer.tsx`, `src/scenes/CameraRig25D.ts`, `src/scenes/TransportScenes.tsx` (`useRideCycle` и hidden) | graphics-engineer |
| изменить | `e2e/background.spec.ts`, `e2e/lifecycle.spec.ts` (возврат после 3 ч через `page.clock`) | qa-engineer + browser-performance-engineer |
| изменить | `.claude/skills/long-session-stability/SKILL.md` (B-21) | architect |

**Порядок:** BA §7, шаги 1–9.

**Критерии готовности**
- [ ] Базовая линия метрик BA §6 записана в `PROGRESS.md` до правок и после.
- [ ] `node scripts/bg-cpu.mjs`: rAF = 0, отрисовок canvas = 0, записей стилей = 0, `TaskDuration` ≤ 0.6 с за 60 с, `contextState === 'running'`, `eventKey` вырос.
- [ ] Тест разрыва таймера 3 ч: состояние = непрерывному прогону ± 1 событие; `'travel-sound'` и `setCaption` не «залпом»; ≤ 50 мс.
- [ ] `Grep "useWorldStore()\|useAudioStore()" src` → 0; `Grep "s.eventElapsed" src` → 0 в компонентах.
- [ ] Возврат из фона (60 с): ни один прохожий не исчезает посреди кадра; герой на расчётном месте (e2e).
- [ ] `diagnostics()`: один `AudioContext`.
- [ ] `node scripts/soak.mjs 35 --build`: heap ≤ +0.05 МБ/мин, FPS ≥ 55, late/dropped/clip = 0.
- [ ] `node scripts/audio-lab.mjs 30 --build`: все нули; добавлен сценарий «перемотка 3 ч».
- [ ] `npm run qa` зелёный; существующие e2e не изменили ожиданий (поведение при 60× прежнее).

**Команды**
```
npm run verify
npx vitest run src/simulation/__tests__/simClock.test.ts
npx playwright test e2e/background.spec.ts e2e/lifecycle.spec.ts e2e/audio.spec.ts e2e/map.spec.ts --reporter=line
node scripts/bg-cpu.mjs
node scripts/soak.mjs 35 --build
node scripts/audio-lab.mjs 30 --build
npm run qa
```

**Промт**
```
Ты ведёшь Фазу 1 «Стабильность и фоновый режим» проекта MOSCOW LIFE в роли architect.
Прочитай по порядку: PROGRESS.md, MASTER_EXECUTION_ROADMAP.md (Фаза 1), BUGFIX_AND_OPTIMIZATION_AUDIT.md целиком,
REALTIME_TRANSIT_AND_MOVEMENT_SPEC.md §1, SONNET_DEVELOPMENT_TOOLKIT.md §0 и §3.

Действуй строго по BUGFIX_AND_OPTIMIZATION_AUDIT.md §7, шаги 1–9, по одному шагу за раз:
1. Вызови browser-performance-engineer: создать scripts/bg-cpu.mjs (алгоритм — аудит §2.3) и снять базовую линию всех метрик §6.
2. Вызови audio-engineer и graphics-engineer: дочитать непроверенные файлы своих зон (аудит §1, §4.1) и дописать находки в таблицу.
3. Сам добавь типы: TimeMode, поле silent в ScenarioEventTravelFields, timeMode в worldStore (значение 'x60'), silent в событии eventBus 'travel-state'. Запусти npm run typecheck.
4. Вызови world-simulation-engineer: simClock.ts, eventProgress.ts, ticker.worker.ts, затем ScenarioEngine (спецификация §1.3–1.5). Масштаб времени остаётся 60, но только через clock.scale. Сначала тест разрыва таймера на 3 часа.
5. Вызови audio-engineer: B-04, B-11, B-13, B-24.
6. Вызови frontend: B-06, B-07, B-08, B-17. Затем graphics-engineer: CityMap25D (B-06, B-26), B-09, B-03 и B-05 (временные меры из аудита §2.3), B-14, B-15, B-18.
7. Вызови browser-performance-engineer: soak 35 минут, при росте heap — heap-diff и поиск причины (аудит §3.5).
8. Вызови qa-engineer: e2e возврата из фона и полный набор ворот.

Ограничения: новых зависимостей нет; поведение при 60× для пользователя не меняется; файлы вне списка фазы не трогать;
один шаг агента — не больше 3 файлов. После каждого шага требуй вывод команд проверки. Не принимай работу без цифр «до/после».
Фаза закончена, когда выполнены все критерии готовности из роадмапа. В конце: npm run qa, /code-review, запись в PROGRESS.md.
Если шаг блокируется — остановись и сообщи причину, не обходи.
```

---

## Фаза 2. Реальное время и микро-фазы пути

**Цель:** перемещение 1:1 с реальной Москвой; постанционный проезд; светофоры с фазами; остановки автобуса и пробки; четыре режима времени. Источник — RT целиком. Закрывается B-02, B-10 (данные), B-20.

**Файлы**

| Действие | Файл | Кто |
|---|---|---|
| изменить | `src/types/index.ts` (фазы, `crosswalk-go`, поля `meters`, `signal`, `hop`), `src/data/cityGraph.ts` (интерфейсы `meters`, `street`), `src/stores/mapStore.ts` (`peek`) | architect |
| создать | `src/simulation/travel/segments.ts`, `crosswalk.ts`, `congestion.ts` + тесты `segments.test.ts`, `crosswalk.test.ts` | world-simulation-engineer |
| изменить | `src/data/transit.ts`, `src/data/cityGraph.ts` (построение), `src/simulation/travel/states.ts`, `validateChain.ts`, `router.ts`, `planTrip.ts`, `src/simulation/engine/ScenarioEngine.ts` (смена `timeMode`, `realtime`) | world-simulation-engineer |
| создать | `src/simulation/__tests__/metroHops.test.ts`, `timing.test.ts`, `realtimeTrip.test.ts` | world-simulation-engineer |
| изменить | `src/audio/engine/TravelSoundEngine.ts`, `src/audio/core/AudioLifecycleManager.ts` (RT §7), `src/audio/engine/travel.test.ts`, `src/audio/diagnostics/audioLab.ts` (сценарий «5 станций при 15×») | audio-engineer |
| изменить | `src/scenes/MetroScenes.tsx`, `TransportScenes.tsx`, `OutdoorScene.tsx`, `src/scenes/art/StreetKit.tsx` (RT §9: `data-ride`, табло по событию, светофор с таймером; анимация пока CSS, управляемая атрибутом) | graphics-engineer |
| изменить | `src/components/controls/Panels.tsx` (переключатель режима времени), `src/features/city/LocationCard.tsx` («Заглянуть»), `src/components/layout/Overlays.tsx` (плашка peek), `src/scenes/SceneStage.tsx` (`viewLocation`) | frontend (SceneStage — с architect) |
| создать | `e2e/realtime.spec.ts`; параметр `?time=` в `src/main.tsx`; `scripts/shots.mjs` и e2e переходят на `?time=x60` | qa-engineer + frontend |
| после приёмки остального | `src/data/transit.ts` — МЦК/МЦД (RT §5.7) | world-simulation-engineer |

**Порядок:** RT §11, шаги 1–12.

**Критерии готовности**
- [ ] Все тесты RT §10 зелёные; 7 суток × 6 режимов без нарушений `validateChain`.
- [ ] Поездка метро из N перегонов даёт N событий `metro-ride` с верными соседними станциями; на табло вагона — название из события.
- [ ] Каждое событие укладывается в диапазоны: шаг 1.35 м/с × коэффициент; красный 20–45 с; переход 12–20 с; вход 45–60 с; эскалатор 45–170 с; перегон 110–160 с; торможение 15 с; стоянка 20–25 с; пересадка 180–240 с (кросс-платформенная 45 с); стоянка автобуса 20–30 с.
- [ ] `place:vdnh → place:khamovniki` в 12:00 — 30–50 игровых минут; в режиме `realtime` это столько же реальных минут (проверка через `page.clock`).
- [ ] Часы пик 08:00–10:00 и 17:30–19:30: автобус в 09:00 едет дольше, чем в 13:00 (тест).
- [ ] Переключение `timeMode` посреди события не сбрасывает прогресс; `peek` не меняет `worldStore.node`.
- [ ] В коде нет литерала 60 как масштаба времени (`Grep` по `src/features/characters`, `src/audio`, `src/scenes`).
- [ ] `audio-lab`: все нули, включая сценарий «5 станций при 15×»; при 60× одноразовые звуки микро-фаз не играются.
- [ ] `bg-cpu.mjs` и `soak.mjs 35` — бюджеты Фазы 1 сохранены.
- [ ] user-simulator, персона А, шаги 3–6: ПРИНЯТЬ. `npm run qa` зелёный.

**Команды**
```
npx vitest run src/simulation src/data src/audio
npm run verify
npx playwright test e2e/realtime.spec.ts e2e/app.spec.ts e2e/map.spec.ts e2e/audio.spec.ts --reporter=line
node scripts/audio-lab.mjs 30 --build
node scripts/shots.mjs && npm run e2e:visual
node scripts/soak.mjs 35 --build
npm run qa
```

**Промт**
```
Ты ведёшь Фазу 2 «Реальное время и микро-фазы пути» проекта MOSCOW LIFE в роли architect.
Прочитай: PROGRESS.md, MASTER_EXECUTION_ROADMAP.md (Фаза 2), REALTIME_TRANSIT_AND_MOVEMENT_SPEC.md целиком,
SONNET_DEVELOPMENT_TOOLKIT.md §0 и §3. Убедись, что критерии Фазы 1 выполнены (запись в PROGRESS.md); если нет — остановись.

Выполняй шаги спецификации §11 по порядку, по одному:
- Шаг 1 делаешь сам (типы, интерфейсы графа, mapStore.peek), затем npm run typecheck.
- Шаги 2–10 и 12 — world-simulation-engineer, каждый шаг отдельным вызовом, каждый начинается с падающего теста.
  Все числа и формулы берутся из спецификации без изменений; глубины станций (§5.3) агент обязан сверить с открытым источником.
- Шаг 11: audio-engineer (спецификация §7), graphics-engineer (§9), frontend (§8). Они работают параллельно только после того,
  как шаги 1–9 приняты и контракт события зафиксирован.
- qa-engineer: e2e/realtime.spec.ts, перевод существующих e2e и scripts/shots.mjs на параметр ?time=x60.

Ограничения: ScenarioEvent.duration остаётся в игровых минутах; id узлов графа и алгоритм Dijkstra не меняются;
новых зависимостей нет; значение timeMode по умолчанию для пользователя — 'realtime', для тестов — ?time=x60.
Принимай каждый шаг только с выводом npx vitest run src/simulation src/data и npm run typecheck.
В конце: user-simulator (персона А), npm run qa, /code-review, запись в PROGRESS.md с фактическим временем поездки ВДНХ → Хамовники.
```

---

## Фаза 3. Кинематика и живые сцены

**Цель:** походка без скольжения с IK и пружинами; реакция на погоду; подвеска транспорта; двери и обмен пассажиров по фазам; пул сущностей; один хаб анимации. Источник — 3D §3. Закрываются B-03, B-05, B-10, B-16, B-25 окончательно.

**Файлы**

| Действие | Файл | Кто |
|---|---|---|
| создать | `src/scenes/kinematics/animationClock.ts`, `spring.ts`, `ik2.ts`, `gait.ts`, `vehicleSuspension.ts` + тесты к каждому | graphics-engineer |
| изменить | `src/scenes/CameraRig25D.ts`, `src/features/weather/WeatherRenderer.tsx`, `src/components/player/Visualizer.tsx` (переход на хаб), `src/features/city/LightingController.tsx` | graphics-engineer (Visualizer — с frontend) |
| изменить | `src/scenes/art/Person.tsx` (режим `rig`), `src/features/characters/Hero.tsx`, `src/features/city/EntityLayer.tsx` (пул 22 слотов) | graphics-engineer |
| изменить | `src/scenes/art/Vehicles.tsx`, `src/scenes/MetroScenes.tsx`, `TransportScenes.tsx`, `OutdoorScene.tsx`, `src/scenes/art/StreetKit.tsx`, `src/index.css` (удаление заменённых keyframes) | graphics-engineer |
| изменить | `e2e/visual.spec.ts-snapshots/*` (после вердикта) | qa-engineer |

**Порядок:** 3D §6, шаги 1–8.

**Критерии готовности**
- [ ] Тесты 3D §5 для `ik2`, `spring`, `gait`, `vehicleSuspension`, `animationClock` зелёные.
- [ ] `Grep "requestAnimationFrame" src` → ровно одно место (`animationClock.ts`).
- [ ] Скольжение стопы героя ≤ 3 % (тест `gait.test.ts` + покадровая проверка в e2e: экранная позиция опорной стопы на 5 соседних кадрах меняется ≤ 1.5 px).
- [ ] Удалены: CSS-цикл вагона 64 с, `useRideCycle`, `setTimeout` в `EntityLayer`.
- [ ] Двери открываются в начале `dwell` и закрываются за 3 с до конца, синхронно со звуком (e2e сверяет атрибут и момент подсказки, расхождение ≤ 300 мс).
- [ ] Возврат после 60 с и после 3 ч в фоне: герой, поезд, панорама за окном — на расчётных местах; сущности не исчезают.
- [ ] `soak-heapdiff.mjs 2 8`: число SVG-элементов и замыканий не растёт; `soak.mjs 35`: бюджеты BA §6.
- [ ] `lowPerf` и `prefers-reduced-motion`: статичные позы, 30 fps, без ошибок.
- [ ] visual-art-director: ПРИНЯТЬ (матрица кадров + серия из 8 кадров походки подряд); эталоны обновлены с причиной.
- [ ] `npm run qa` зелёный.

**Команды**
```
npx vitest run src/scenes
npm run verify
node scripts/shots.mjs && npm run e2e:visual
npx playwright test e2e/background.spec.ts e2e/lifecycle.spec.ts e2e/realtime.spec.ts --reporter=line
node scripts/bg-cpu.mjs
node scripts/soak-heapdiff.mjs 2 8
node scripts/soak.mjs 35 --build
npm run qa
```

**Промт**
```
Ты ведёшь Фазу 3 «Кинематика и живые сцены» проекта MOSCOW LIFE в роли architect.
Прочитай: PROGRESS.md, MASTER_EXECUTION_ROADMAP.md (Фаза 3), TRANSITION_TO_3D_AND_KINEMATICS.md §3, §5, §6,
REALTIME_TRANSIT_AND_MOVEMENT_SPEC.md §9, BUGFIX_AND_OPTIMIZATION_AUDIT.md §3 и §6, SONNET_DEVELOPMENT_TOOLKIT.md §0, §3.
Проверь, что Фаза 2 принята.

Вызывай graphics-engineer по шагам 1–8 из TRANSITION_TO_3D_AND_KINEMATICS.md §6, по одному шагу за вызов.
Чистые функции (animationClock, spring, ik2, gait, vehicleSuspension) — сначала тест, потом код.
Формулы и коэффициенты пружин берутся из §3 без изменений. Новых зависимостей в этой фазе нет: Three.js ещё не подключается.
После каждого шага, меняющего картинку: node scripts/shots.mjs, просмотр PNG, npm run e2e:visual.
После шагов 1, 5, 6, 7: browser-performance-engineer запускает bg-cpu.mjs и soak.mjs 10 --build и сверяет бюджеты.
После шага 8: visual-art-director (матрица кадров и серия кадров походки), затем qa-engineer обновляет эталоны с причиной.

Запрещено: аллокации и setState в колбэках кадра; собственные requestAnimationFrame вне animationClock;
анимация свойств кроме transform и opacity; интегрирование пропущенного времени (после фона положения восстанавливаются из getEventProgress()).
В конце: npm run qa, /code-review, запись в PROGRESS.md с цифрами FPS, узлов DOM и наклона heap.
```

---

## Фаза 4. 3D-карта Москвы

**Цель:** полноэкранная карта на Three.js + R3F: рельеф, река с шейдером, кольца, кварталы с ночными окнами, ориентиры, движущийся транспорт, герой и маршрут. Источник — 3D §1–§2.

**Ворота входа (3D §1.4):** Фазы 1–3 приняты · карточки security-reviewer на 4 пакета · подтверждение пользователя · замер прототипа в бюджете. Не пройдено — фаза не начинается; architect сообщает пользователю и предлагает оставить CSS-3D карту.

**Файлы**

| Действие | Файл | Кто |
|---|---|---|
| изменить | `package.json` (4 пакета; подтверждает пользователь) | architect после security-reviewer |
| создать | `scripts/gl-stats.mjs` | browser-performance-engineer |
| создать | `src/world3d/World3DCanvas.tsx`, `renderGate.ts`, `geo3d.ts`, `CityMap3D.tsx`, `terrain/Ground.tsx`, `terrain/River.tsx`, `terrain/Rings.tsx`, `blocks/blockLayout.ts`, `blocks/Blocks.tsx`, `Landmarks3D.tsx`, `transit/TransitLines3D.tsx`, `transit/Vehicles3D.tsx`, `HeroMarker3D.tsx`, `camera/MapCamera.ts`, `shaders/water.glsl.ts`, `shaders/blocks.glsl.ts` + тесты `renderGate.test.ts`, `blockLayout.test.ts`, `geo3d.test.ts` | graphics-engineer |
| изменить | `src/app/App.tsx` (ленивый слой), `src/features/city/CityMapHub.tsx` (3D вместо `CityMap25D variant="full"`; при `lowPerf` без WebGL — прежняя карта) | frontend |
| создать | `e2e/map3d.spec.ts`; эталоны `map3d-day`, `map3d-night` | qa-engineer |
| изменить | `CLAUDE.md`, `CLAUDE_TOOLS.md` (правило о Three.js, список пакетов) | architect |

**Порядок:** 3D §6, шаги 9–14.

**Критерии готовности**
- [ ] `npm audit --omit=dev`: 0 high/critical; карточки зависимостей приложены.
- [ ] 3D-чанк ≤ 350 КБ gzip, грузится только при первом открытии карты; начальный JS вырос ≤ 15 КБ gzip.
- [ ] `node scripts/gl-stats.mjs`: draw calls ≤ 120, треугольников ≤ 300 000, один контекст; после 10 циклов «открыть/закрыть» `renderer.info.memory` не растёт.
- [ ] FPS на карте ≥ 55 (lowPerf — кадр по требованию); при закрытой карте и в скрытой вкладке кадров WebGL 0 (`bg-cpu.mjs`).
- [ ] `blockLayout.test.ts`: детерминированность, ни одного дома в реке и на кольцах.
- [ ] На скриншотах карты видны и узнаваемы: река, три кольца, кварталы с окнами ночью, ≥ 7 ориентиров из таблицы 3D §2.4, линии метро своих цветов, герой и маршрут.
- [ ] Поезда не ходят ночью (01:00–05:30); герой в метро движется вдоль своей линии.
- [ ] Все существующие тесты карты (`e2e/map.spec.ts`) зелёные: API `MapViewHandle` сохранён.
- [ ] Потеря WebGL-контекста (`webglcontextlost`) — карта переключается на CSS-вариант без ошибок.
- [ ] visual-art-director: ПРИНЯТЬ (день, ночь, zoom 1 и 1.5). user-simulator, персона А, шаги 2–3: ПРИНЯТЬ.
- [ ] `soak.mjs 35 --build` с открытой картой: бюджеты BA §6. `npm run qa` зелёный.

**Команды**
```
npm audit --omit=dev
npx vitest run src/world3d
npm run verify            # смотреть размеры чанков в выводе сборки
npx playwright test e2e/map3d.spec.ts e2e/map.spec.ts e2e/background.spec.ts --reporter=line
node scripts/gl-stats.mjs
node scripts/bg-cpu.mjs
node scripts/soak.mjs 35 --build
npm run e2e:visual
npm run qa
```

**Промт**
```
Ты ведёшь Фазу 4 «3D-карта Москвы» проекта MOSCOW LIFE в роли architect.
Прочитай: PROGRESS.md, MASTER_EXECUTION_ROADMAP.md (Фаза 4), TRANSITION_TO_3D_AND_KINEMATICS.md §0–§2, §5, §6,
BUGFIX_AND_OPTIMIZATION_AUDIT.md §6, SONNET_DEVELOPMENT_TOOLKIT.md целиком.

Сначала ворота входа (TRANSITION_TO_3D_AND_KINEMATICS.md §1.4):
1. Проверь по PROGRESS.md, что Фазы 1–3 приняты и базовые метрики записаны.
2. Вызови security-reviewer: карточки зависимостей three, @react-three/fiber, @react-three/drei, @types/three
   (актуальные версии и peerDependencies проверить командой npm view, а не по документу).
3. Спроси у пользователя подтверждение установки. Без него не продолжай.
4. Вызови graphics-engineer: прототип — пустой Canvas с 6000 инстансов; browser-performance-engineer создаёт scripts/gl-stats.mjs и меряет.
   Если бюджет не выполнен — остановись и доложи пользователю цифры.

Затем шаги 9–14 из TRANSITION_TO_3D_AND_KINEMATICS.md §6, по одному за вызов graphics-engineer.
Перед каждым вызовом напомни: API three / R3F / drei — только через Context7 с версией из package.json;
разрешённые примитивы — таблица §1.3; в useFrame нет аллокаций; один Canvas на приложение; frameloop — через renderGate.ts.
frontend подключает карту в CityMapHub.tsx, сохраняя интерфейс MapViewHandle; при lowPerf или потере контекста остаётся CSS-карта.
qa-engineer: e2e/map3d.spec.ts и проверка через Playwright MCP по SONNET_DEVELOPMENT_TOOLKIT.md §2.2.
В конце: visual-art-director, user-simulator (персона А), npm run qa, /code-review, /security-review,
обновление CLAUDE.md и CLAUDE_TOOLS.md, запись в PROGRESS.md с размерами чанков и цифрами gl-stats.
PixiJS и любые загрузчики моделей не подключать.
```

---

## Фаза 5. Camera Dive, непрерывные переходы, акустика пространств

**Цель:** пролёт камеры с карты в сцену и в окно вагона; вместо занавеса — проходы камеры через двери, эскалатор, двери поезда; звук меняет пространство вместе с картинкой; «Заглянуть» использует пролёт. Источник — 3D §2.6, §4; BA §4.4.

**Файлы**

| Действие | Файл | Кто |
|---|---|---|
| изменить | `src/stores/worldStore.ts` (`transition`), `src/types/index.ts` (`TransitionKind`) | architect |
| создать | `src/world3d/camera/cameraDive.ts` + тест | graphics-engineer |
| создать | `src/scenes/transitions/transitionKind.ts` + тест, `SceneTransitionDirector.ts` | graphics-engineer |
| изменить | `src/simulation/engine/ScenarioEngine.ts` (`playNext`: вид и длительность перехода) | world-simulation-engineer |
| изменить | `src/scenes/SceneStage.tsx` (две сцены на время перехода), `MetroScenes.tsx`, `TransportScenes.tsx`, `OutdoorScene.tsx`, `IndoorScenes.tsx` (якоря дверей), `src/index.css` | graphics-engineer (SceneStage — с architect) |
| создать | `src/audio/engine/AcousticSpace.ts` + тест | audio-engineer |
| изменить | `src/audio/engine/AudioMixer.ts` (посыл в реверберацию городской шины), `CitySoundEngine.ts`, `src/audio/core/AudioLifecycleManager.ts` (выбор пространства, peek) | audio-engineer |
| изменить | `src/features/city/CityMapHub.tsx`, `LocationCard.tsx`, `src/components/layout/Overlays.tsx` (занавес только для `cut`) | frontend |
| создать | `e2e/transitions.spec.ts` | qa-engineer |

**Порядок:** 3D §6, шаги 15–18; параллельно audio-engineer — `AcousticSpace`.

**Критерии готовности**
- [ ] `transitionKind.test.ts` покрывает каждую строку таблицы 3D §4.2; `cameraDive.test.ts` зелёный.
- [ ] Цепочка «улица → вестибюль → эскалатор → платформа → вагон» при `?time=x15`: `data-transition` = `push-in → descend → slide`; непрозрачность занавеса всё время 0; чёрных кадров нет (e2e: средняя яркость кадра не падает ниже 8 % на протяжении перехода).
- [ ] Пролёт карта → сцена: 1600 мс, без рывка (нет long task > 50 мс), заканчивается на сцене, где находится герой; вариант «в окно вагона» работает во время поездки.
- [ ] Вне перехода смонтирована одна сцена: DOM-узлы в покое — как до фазы ± 5 %.
- [ ] Акустика: `spaceFor` покрыт тестом по таблице BA §4.4; `audio-lab` сценарий «улица → вагон за 20 с» — 0 щелчков; при открытии карты — `map-overview`.
- [ ] `peek`: пролёт туда и обратно; окружение звучит от просматриваемой локации, звуки поездки заглушены; маршрут героя не изменился (тест).
- [ ] Режим 60×, `lowPerf`, `prefers-reduced-motion`, скрытая вкладка: переходы упрощены по 3D §4.3, ошибок нет.
- [ ] `bg-cpu.mjs`, `soak.mjs 35`, `gl-stats.mjs` — в бюджете.
- [ ] user-simulator: персона А (шаги 6–7) и персона Б (шаг 4) — ПРИНЯТЬ. visual-art-director — ПРИНЯТЬ. `npm run qa` зелёный.

**Команды**
```
npx vitest run src/scenes src/world3d src/audio src/simulation
npm run verify
npx playwright test e2e/transitions.spec.ts e2e/map3d.spec.ts e2e/realtime.spec.ts e2e/audio.spec.ts --reporter=line
node scripts/audio-lab.mjs 30 --build
node scripts/bg-cpu.mjs && node scripts/gl-stats.mjs
node scripts/soak.mjs 35 --build
npm run qa
```

**Промт**
```
Ты ведёшь Фазу 5 «Camera Dive, непрерывные переходы, акустика пространств» проекта MOSCOW LIFE в роли architect.
Прочитай: PROGRESS.md, MASTER_EXECUTION_ROADMAP.md (Фаза 5), TRANSITION_TO_3D_AND_KINEMATICS.md §2.6 и §4,
BUGFIX_AND_OPTIMIZATION_AUDIT.md §4.3–§4.4, REALTIME_TRANSIT_AND_MOVEMENT_SPEC.md §8.2, SONNET_DEVELOPMENT_TOOLKIT.md §0, §3.
Проверь, что Фаза 4 принята.

1. Сам добавь типы: TransitionKind и поле worldStore.transition; поле transitionTo сохрани и заполняй как раньше (на него подписан звук).
2. graphics-engineer: transitionKind.ts с тестом на каждую строку таблицы §4.2.
3. world-simulation-engineer: ScenarioEngine.playNext выбирает вид и длительность перехода; для silent и коротких (< 2 реальных секунд) событий — без анимации.
4. graphics-engineer: SceneTransitionDirector.ts и две сцены в SceneStage.tsx на время перехода; затем виды переходов по одному
   (push-in, descend/ascend, slide, pull-out), каждый отдельным шагом со скриншотами середины перехода.
5. graphics-engineer: cameraDive.ts (план пролёта — §2.6, числа без изменений), кроссфейд в сцену, вариант «в окно вагона».
6. audio-engineer (параллельно шагам 2–5): AcousticSpace.ts по таблице §4.4 без создания узлов при смене пространства; звук для peek.
7. frontend: «Перейти в сцену» и «Заглянуть» запускают пролёт; занавес остаётся только для вида cut.
8. qa-engineer: e2e/transitions.spec.ts (нет чёрных кадров, последовательность видов), проверка звука и peek.

Ограничения: вне перехода смонтирована одна сцена; никаких новых зависимостей; анимация только transform и opacity через animationClock;
в скрытой вкладке переходы не анимируются. В конце: user-simulator (обе персоны), visual-art-director, npm run qa, /code-review, запись в PROGRESS.md.
```

---

## Фаза 6. Полировка, 8-часовой прогон, релиз

**Цель:** доказать многочасовую стабильность, закрыть безопасность и доступность, привести документацию в соответствие с кодом.

**Файлы**

| Действие | Файл | Кто |
|---|---|---|
| изменить | `index.html` (CSP; подтверждает пользователь) | frontend по отчёту security-reviewer |
| изменить | `src/audio/core/mediaIntegration.ts` (станция в заголовке, BA §4.5) | audio-engineer |
| изменить | `e2e/a11y.spec.ts`, `e2e/qa-full.spec.ts`, `e2e/qa-stress.spec.ts` (новые элементы UI, режимы времени, карта) | qa-engineer |
| изменить | `README.md`, `QA_CHECKLIST.md`, `CLAUDE_TOOLS.md`, `DEVELOPMENT_WORKFLOW.md`, `.claude/skills/*` (сверка с кодом) | architect |
| исправления по результатам прогонов | любые, строго у владельцев зон | по находкам |

**Критерии готовности**
- [ ] `node scripts/soak.mjs 480 --build` (8 часов, режим `realtime`): heap ≤ +0.05 МБ/мин (итог ≤ +25 МБ), DOM/слушатели/аудиоузлы — плато, FPS ≥ 55, late/dropped/clip/NaN = 0, ошибок консоли 0, один `AudioContext`, один WebGL-контекст.
- [ ] 4 часа в фоне (`page.clock` + реальный прогон 30 мин через `bg-cpu.mjs`): CPU ≤ 1 %, кадров 0; после возврата — корректное состояние за ≤ 100 мс.
- [ ] Сон системы (frozen → active, CDP): звук возобновляется сам или по первому жесту с подсказкой; симуляция догоняет бесшумно.
- [ ] CSP внедрена; `npm run e2e` целиком зелёный с ней; `npm audit --omit=dev` — 0 high/critical; `/security-review` без high.
- [ ] axe: 0 serious/critical на стартовом экране, сцене, карте, каждой панели; всё управляется с клавиатуры.
- [ ] Web Vitals (`?perf`): LCP ≤ 2.5 с, CLS = 0, INP «good».
- [ ] Адаптивность: 1600×900, 1366×768, 390×844 — эталоны актуальны.
- [ ] user-simulator: обе персоны — оценка ≥ 8/10 и ПРИНЯТЬ. visual-art-director — ПРИНЯТЬ.
- [ ] Документация: каждый упомянутый в `CLAUDE.md`, `README.md`, skills файл и команда существуют (проверка Glob/запуском); `PROGRESS.md` сокращён до актуального состояния.
- [ ] `npm run qa` зелёный; `/code-review` без P0/P1.

**Команды**
```
npm run qa
node scripts/soak.mjs 480 --build
node scripts/bg-cpu.mjs
node scripts/gl-stats.mjs
node scripts/audio-lab.mjs 30 --build
npm audit --omit=dev
npm run e2e
```

**Промт**
```
Ты ведёшь Фазу 6 «Полировка, 8-часовой прогон, релиз» проекта MOSCOW LIFE в роли architect.
Прочитай: PROGRESS.md, MASTER_EXECUTION_ROADMAP.md (Фаза 6), BUGFIX_AND_OPTIMIZATION_AUDIT.md §6, QA_CHECKLIST.md,
SONNET_DEVELOPMENT_TOOLKIT.md §3. Проверь, что Фаза 5 принята.

1. browser-performance-engineer: запусти node scripts/soak.mjs 480 --build в фоне (режим realtime) и, пока он идёт, bg-cpu.mjs на 30 минут
   и проверку frozen → active через CDP. Любое превышение бюджета — находка с файлом и строкой, исправляет владелец зоны, затем повторный замер.
2. security-reviewer: полный отчёт по 12 инвариантам. frontend внедряет CSP в index.html (нужно подтверждение пользователя), затем npm run e2e целиком.
3. qa-engineer: расширить a11y, qa-full, qa-stress на новые элементы (режимы времени, карта, «Заглянуть»); npm run qa.
4. audio-engineer: станция в заголовке вкладки и медиа-центре (аудит §4.5); финальный audio-lab.
5. user-simulator: обе персоны полностью. visual-art-director: полная матрица кадров.
6. Сам: сверь CLAUDE.md, README.md, QA_CHECKLIST.md, CLAUDE_TOOLS.md, DEVELOPMENT_WORKFLOW.md и skills с кодом — каждый путь и команда должны существовать;
   сократи PROGRESS.md до актуального состояния.

Новых функций в этой фазе нет: только исправления по находкам, каждое — отдельным шагом у владельца зоны с тестом на регрессию.
Релиз возможен только при выполнении всех критериев готовности. Итог: /code-review, /security-review, финальная запись в PROGRESS.md
с таблицей фактических метрик против бюджетов. Что не удалось проверить (например, прослушивание человеком) — перечисли явно.
```

---

## Сквозная таблица зависимостей между фазами

| Что нужно | Появляется в | Используется в |
|---|---|---|
| `SimClock`, `eventProgress`, `silent`, воркер-тикер | Фаза 1 | 2, 3, 4, 5 |
| `scripts/bg-cpu.mjs` | Фаза 1 | все последующие |
| `timeMode`, постанционные события, `signal`, `hop`, `meters` | Фаза 2 | 3 (кинематика по фазам), 4 (герой на линии), 5 (переходы по фазам) |
| `animationClock`, пружины, IK, пул сущностей | Фаза 3 | 5 (директор переходов) |
| `World3DCanvas`, `renderGate`, `MapCamera`, `scripts/gl-stats.mjs` | Фаза 4 | 5 (пролёт) |
| `transition`, `AcousticSpace`, пролёт | Фаза 5 | 6 |

## Что делать, если фаза застряла
1. Критерий не выполняется после двух попыток исправления — остановиться; architect записывает в `PROGRESS.md` факт, цифры и гипотезы.
2. Не снижать порог и не переписывать тест под результат. Изменение бюджета или числа из спецификации — решение пользователя.
3. Ворота Фазы 4 не пройдены — Фазы 5–6 выполняются на CSS-карте: пролёт заменяется существующим наездом (`.scene-arrive`), остальное без изменений.
