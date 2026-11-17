# PROMTS — промты запуска стадий

Как пользоваться: открыть Claude Code в корне проекта, вставить промт стадии целиком. Стадии и критерии готовности — `stages.md`; требования — `CINEMATIC_3D_PLAN.md` (далее «План»). Одна стадия — одна или несколько сессий; каждая сессия начинается с общего блока.

## Общий блок (вставлять первым в любую сессию)
```
Прочитай PROGRESS.md, затем docs/stages.md (строка «Текущая стадия») и раздел этой стадии.
Работай как architect: декомпозируй стадию на шаги не больше 3 файлов исходников, у каждого файла один владелец.
Исполнителей запускай как агентов из .claude/agents (модель sonnet), каждому давай: цель одной фразой, список файлов,
инварианты, команду проверки, что вернуть. Числа и формулы — только из docs/CINEMATIC_3D_PLAN.md и
docs/BUGFIX_AND_OPTIMIZATION_AUDIT.md §6. API библиотек — только через Context7 с версией из package.json.
Принимай работу только с выводом команд. После каждого принятого шага — одна строка в PROGRESS.md.
Стоп и доклад мне, если: проверка красная после двух исправлений; нужна зависимость или правка конфига;
документ расходится с кодом; бюджет Плана §9 не выполняется.
```

## S0 — хвост Фазы 1
```
Стадия S0 из docs/stages.md. Задачи:
1. browser-performance-engineer: продолжи бисекцию heap в скрытой вкладке. Запусти по очереди (каждый 10 мин,
   не параллельно, на одной сборке): node scripts/bg-cpu.mjs --build --heap --secs 600 --kill music ;
   node scripts/bg-cpu.mjs --heap --secs 600 --kill weather,city,travel ; node scripts/bg-cpu.mjs --heap --secs 600.
   Известно: только симуляция +0.154 МБ/мин, всё включено +0.83. Найди движок-лидер, затем
   node scripts/soak-heapdiff.mjs 2 8 и тип объекта-лидер. Правку в src/audio делает audio-engineer.
2. browser-performance-engineer: node scripts/bg-cpu.mjs --realtime --kill music --secs 60 три раза;
   порог ≤ 1 коммит React в минуту, TaskDuration ≤ 0.6 с.
3. Не меняй пороги сам. Принеси мне таблицу: метрика, медиана трёх прогонов, порог, статус — и предложение по
   порогу CPU для 60× (нормировка на число событий).
Готово, когда выполнены критерии S0 и npm run verify зелёный.
```

## S1 — фундамент 3D и ворота
```
Стадия S1 из docs/stages.md, План §2, §3, §8, §9.
1. security-reviewer: карточки зависимостей для three@0.187.0, @react-three/fiber@9.8.2, @react-three/drei@10.7.9,
   postprocessing@6.39.6, @react-three/postprocessing@3.2.2, n8ao@2.1.0, three-custom-shader-material@6.4.0,
   @types/three@0.187.0, earcut@3.2.4, @gltf-transform/cli@4.5.1. Вердикт по каждому. Без вердикта «РАЗРЕШИТЬ» не ставим.
2. Установи разрешённые пакеты точными версиями (хук спросит меня — это ожидаемо).
3. architect: [выполнено; renderMode удалён 17.11.2026] worldStore.quality ('high' | 'medium' | 'low'); SceneStage рендерит только World3D.
4. graphics-engineer, по одному шагу: (а) src/world3d/geo.ts + тест; (б) renderConfig.ts, quality.ts, frame.ts;
   (в) World3D.tsx — ленивый чанк, один <Canvas>, пол, тестовый куб, солнце, PostStack в составе Bloom + ToneMapping + SMAA.
5. browser-performance-engineer: scripts/gl-stats.mjs (FPS, draw calls, треугольники, renderer.info.memory,
   число контекстов; production-сборка, GPU-флаги как в scripts/soak.mjs); в scripts/bg-cpu.mjs — счётчик draw calls уже есть, проверь в 3D.
6. qa-engineer: e2e/world3d.spec.ts — канвас есть и 0 ошибок консоли (параметр ?r не нужен).
Готово, когда выполнены критерии S1. В отчёт: размер чанка 3D gzip, рост начального бандла, FPS, draw calls в скрытой вкладке.
```

## S2 — город из OSM
```
Стадия S2 из docs/stages.md, План §4.
1. asset-pipeline-engineer: scripts/city-bake.mjs для района tverskaya (квадрат 1400 м вокруг LOCATIONS.tverskaya):
   запрос Overpass → контуры → экструзия → бинарный тайл public/city/tverskaya.bin + index.json. Сырые ответы
   Overpass кэшируй в assets/source/osm/ (чтобы запекание было повторяемым без сети). Напечатай: число домов,
   долю домов с известной высотой, вершины, треугольники, размер gzip.
2. graphics-engineer: src/world3d/city/cityTiles.ts (разбор тайла, тест формата) → CityBlocks.tsx с временным
   MeshStandardMaterial.
3. browser-performance-engineer: прототип-замер ворот (План §8 п. 3) на районе tverskaya. Провал — стоп и доклад.
4. После прохождения ворот: остальные 10 районов, дальний город, затем Roads.tsx, River.tsx, Trees.tsx.
5. world-simulation-engineer: сплайны дорог района в метрах для транспорта (чистые данные + тест), без правки сигнатур графа.
6. visual-art-director: кадры 13:00 по каждому району — узнаётся ли планировка.
```

## S3 — свет и небо
```
Стадия S3 из docs/stages.md, План §5.
graphics-engineer по шагам: light/worldLight.ts (мост getLighting → свет и uniforms, 4 Гц, без ререндера React) →
sky/SunMoon.ts + тест «направление совпадает с src/data/sun.ts» → тени по уровням качества →
sky/Sky.tsx — свой шейдер неба по Плану §5 (новых пакетов не ставим: drei и @takram отклонены) → ночные окна (эмиссия) и фонари (инстансы) → sky/Clouds.tsx (FBM-шум на куполе).
После каждого шага gl-stats на High, Medium, Low. Облака не укладываются в 50 FPS на High — стоп, доклад с цифрами и вариант замены (слоистая текстура).
visual-art-director: матрица кадров Плана §10 (node scripts/shots3d.mjs), вердикт.
```

## S4 — материалы и погода
```
Стадия S4 из docs/stages.md, План §5.
graphics-engineer по шагам: city/facadeMaterial.ts (окна, простенки, цоколь, карниз, 4 типа зданий, снег, намокание) →
Roads.tsx (мокрый асфальт, лужи, отражения на High/Medium) → weather/Rain3D.tsx и Snow3D.tsx (позиции в вершинном
шейдере, ноль обновлений буферов) → высотный туман → weather/Lightning.tsx по eventBus 'lightning'.
audio-engineer: сверь, что гром и шаги по-прежнему приходят от тех же событий (кода звука не менять без причины).
Проверка каждого шага: gl-stats, soak-heapdiff (ноль аллокаций в кадре), кадры дождь / снег / гроза.
```

## S5 — постобработка и камера
```
Стадия S5 из docs/stages.md, План §6.
graphics-engineer: post/PostStack.tsx в полном составе по таблице качества → post/grade.ts (LUT пяти фаз суток
строится кодом из палитры, кроссфейд 4 с) → camera/shots.ts (не меньше 4 планов на каждую уличную локацию,
координаты в метрах) → camera/ShotDirector.ts (сплайн, damp, смена плана по таймеру и по смене события) →
camera/cameraNoise.ts → post/Letterbox.tsx.
Тест: ни одна точка пути камеры не лежит внутри bbox дома района; скорость ≤ 1.5 м/с.
frontend: настройки «Качество» (авто / высокое / среднее / низкое) и «Каше 2.39:1» в Panels.tsx + e2e.
visual-art-director: вердикт по каждому плану (композиция, герой в кадре, читаемость ориентира).
```

## S6 — актёры, транспорт, ориентиры
```
Стадия S6 из docs/stages.md, План §7. Сначала проверь, какие ассеты лежат в assets/source/3d (docs/ASSET_GENERATION_3D.md
§2–§4). Чего нет — список мне, эту часть не начинай и заглушками не заменяй.
asset-pipeline-engineer: для каждого присланного .glb — gltf-transform inspect, проверка лимитов, масштаба и осей,
сжатие в public/models, запись в docs/ASSET_MANIFEST.md.
graphics-engineer: actors/Hero3D.tsx (клип по event.pose, положение из simClock, тест отсутствия скольжения) →
Crowd.tsx (инстансы + вершинная анимация) → Traffic.tsx (инстансы по сплайнам дорог) → MetroTrain.tsx → ориентиры.
world-simulation-engineer: длины путей героя в метрах для каждой фазы (данные для Hero3D), без изменения длительностей.
```

## S7 — интерьеры и салоны
```
Стадия S7 из docs/stages.md. Ассеты — docs/ASSET_GENERATION_3D.md §5; отсутствующие — список мне.
Порядок локаций: metro-station → metro-ride → bus-ride (и такси) → cafe и shop → office → home.
На каждую: набор предметов (asset-pipeline-engineer) → сцена в src/world3d/sets (graphics-engineer) → ≥ 3 плана камеры →
сверка акустического пространства (audio-engineer, только чтение) → кадры и вердикт visual-art-director.
Постанционный проезд метро: табло с event.station / nextStation, остановка, двери — (логика станций — по симуляции; SVG-версия удалена).
```

## S8 — интеграция
```
Стадия S8 из docs/stages.md.
architect: авто-выбор quality при первом запуске; без WebGL2 — экран с пояснением (отката на SVG нет).
graphics-engineer + frontend: карта (M) — вид сверху на тот же мир: маршрут worldStore.plan, пины локаций,
«Перейти в сцену» — пролёт камеры без занавеса.
audio-engineer: setMapOverviewMode и акустические пространства работают в 3D.
qa-engineer: весь набор e2e в 3D.
```

## S9 — приёмка
```
Стадия S9 из docs/stages.md. Запусти по очереди: npm run verify; npm run qa; node scripts/soak.mjs 35 --build (в 3D);
node scripts/gl-stats.mjs --build на трёх уровнях качества; node scripts/bg-cpu.mjs --build (3D, скрытая вкладка).
Затем агенты: security-reviewer (CSP, зависимости, лицензии ассетов, атрибуция OSM), visual-art-director (полная матрица),
user-simulator (обе персоны). Собери единый отчёт: таблица бюджетов Плана §9 и аудита §6 — факт, порог, статус;
список P0/P1; что не проверено. Без моего подтверждения ничего не публикуй.
```

## Разовые промты
**Принять ассет:**
```
Я положил файлы в assets/source/3d/<папка>. Запусти asset-pipeline-engineer: проверь по docs/ASSET_GENERATION_3D.md
(лимиты, оси, масштаб, наличие <name>.prompt.md с лицензией), сожми в public/models, внеси в docs/ASSET_MANIFEST.md.
Что не проходит — список с причиной, сам файл не исправляй.
```
**Кадры для оценки картинки:**
```
Запусти node scripts/shots3d.mjs для района <id>, затем visual-art-director: вердикт по матрице Плана §10.
```
**Замер производительности:**
```
Запусти browser-performance-engineer: gl-stats на High / Medium / Low для района <id> и таблицу против бюджетов Плана §9.
```
