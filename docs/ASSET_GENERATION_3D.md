# ASSET GENERATION 3D — что сгенерировать и где

Список ассетов для `CINEMATIC_3D_PLAN.md`. Статус на 16.11.2026: **ничего не создано.** Правила приёма, форматов и лицензий — `ASSET_PIPELINE.md`. Старый список растровых фонов `ASSET_REQUESTS.md` относится к SVG-рендеру и больше не развивается.

Оговорка: тарифы, лицензии и покрытие сервисов на сегодня не проверялись — список по состоянию знаний на середину 2026 года. Перед оплатой и использованием проверьте условия коммерческого использования на сайте сервиса и запишите их в `<name>.prompt.md`.

## 0. Что не нужно генерировать
- **Массовая застройка, дороги, вода, парки** — берутся из OpenStreetMap скриптом `scripts/city-bake.mjs` (стадия S2). Бесплатно, лицензия ODbL, нужна атрибуция.
- **Небо, облака, дымка** — считаются библиотекой атмосферы.
- **Окна, фасадные детали, мокрый асфальт, дождь, снег** — шейдеры.
- **Цветокоррекция** — LUT собирается кодом из палитры проекта.

## 1. Где генерировать

| Что | Сервис | Замечание |
|---|---|---|
| Картинка-референс для модели, концепт-кадры, текстуры | **FLUX** (уже подключён к Claude Code как MCP) · **Gemini** (подключён) · Midjourney · Recraft | через MCP можно генерировать прямо из сессии, расходуются кредиты |
| То же, из Claude Code командой | skill **pic** (`~/.claude/skills/pic`, установлен 16.11.2026): шлюз HydraAI, оплата с баланса ключа | только картинки (референсы, эталонные кадры, текстуры); 3D-модели шлюз не делает. Порядок работы и бюджет — §9 |
| 3D-модель по картинке или тексту | **Meshy** (meshy.ai) · **Tripo** (tripo3d.ai) · **Rodin / Hyper3D** (hyper3d.ai) · **Hunyuan3D** (открытая модель, можно запускать локально) | архитектуру лучше всего даёт Rodin и Hunyuan3D; персонажей с авто-скелетом — Meshy и Tripo |
| Скелет и анимации персонажа | **Mixamo** (mixamo.com, Adobe, бесплатно) | загрузить модель в T-позе, скачать клипы FBX «without skin», свести в Blender |
| Готовые PBR-материалы и HDRI | **Poly Haven** (polyhaven.com) · **ambientCG** (ambientcg.com) | CC0, атрибуция не обязательна; предпочтительнее генерации |
| Чистка, масштаб, оси, сведение анимаций | **Blender** (бесплатно) | обязательно для каждой модели из генератора |
| Сжатие | `npx gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2` | выполняет agent `asset-pipeline-engineer` |

Порядок для любой модели: (1) картинка-референс в FLUX → (2) image-to-3D → (3) Blender: масштаб в метрах, +Y вверх, начало координат в центре основания, удалить мусорные полигоны, уменьшить число треугольников → (4) экспорт `.glb` → (5) положить исходник и `<name>.prompt.md` в `assets/source/3d/` → (6) сжатие и проверка агентом.

## 2. Ориентиры (12 моделей, нужны к S6)

Лимит: 8 000–15 000 треугольников, одна текстура 1024 (albedo + roughness/metal + normal), ≤ 400 КБ после сжатия. Основание плоское, без земли и деревьев.

| # | Файл | Объект | Район |
|---|---|---|---|
| 1 | `landmarks/mid-highrise.glb` | Высотка МИД на Смоленской | arbat |
| 2 | `landmarks/kremlin-spasskaya.glb` | Спасская башня | zaryadye / kitay-gorod |
| 3 | `landmarks/kremlin-wall-segment.glb` | Сегмент кремлёвской стены с зубцами (тайлится) | zaryadye |
| 4 | `landmarks/st-basil.glb` | Храм Василия Блаженного | zaryadye |
| 5 | `landmarks/christ-saviour.glb` | Храм Христа Спасителя | khamovniki |
| 6 | `landmarks/zaryadye-bridge.glb` | Парящий мост | zaryadye |
| 7 | `landmarks/vdnh-pavilion.glb` | Центральный павильон ВДНХ | vdnh |
| 8 | `landmarks/vdnh-arch.glb` | Арка главного входа ВДНХ | vdnh |
| 9 | `landmarks/ostankino-tower.glb` | Останкинская башня | vdnh (дальний план) |
| 10 | `landmarks/shukhov-tower.glb` | Шуховская башня | neskuchny (дальний план) |
| 11 | `landmarks/gorky-park-gate.glb` | Главный вход Парка Горького | gorky-park |
| 12 | `landmarks/city-towers.glb` | Группа башен «Москва-Сити» (5 башен, одна скрученная) | moscow-city |

**Промт референса (FLUX):**
```
Single isolated building, <OBJECT>, three-quarter view from slightly above, entire structure visible
from base to top, neutral light grey studio background, flat even overcast lighting, no cast shadows,
no people, no cars, no trees, no ground details, accurate architectural proportions, clean readable
silhouette, matte materials, orthographic-like perspective, high detail facade, no text, no logos
```
`<OBJECT>`: 1 `Stalinist skyscraper of the Russian Ministry of Foreign Affairs in Moscow, stepped tiers, central spire` · 2 `Spasskaya tower of the Moscow Kremlin, red brick, green tented roof, clock, star on top` · 3 `straight segment of the Moscow Kremlin red brick wall with swallow-tail merlons, 40 metres long` · 4 `Saint Basil's Cathedral, nine colourful onion domes` · 5 `Cathedral of Christ the Saviour, white marble, five golden domes` · 6 `Zaryadye floating bridge, V-shaped concrete cantilever with glass railing` · 7 `VDNKh central pavilion, Soviet classicism, tall tiered spire with star` · 8 `VDNKh main entrance arch, six pylons, sculpture on top` · 9 `Ostankino television tower, concrete conical base, slender needle` · 10 `Shukhov hyperboloid lattice steel tower` · 11 `Gorky Park main entrance, monumental colonnade gate` · 12 `cluster of five glass skyscrapers, one twisted spiral tower, modern business district`.

**Настройки image-to-3D:** целевое число треугольников 12 000, текстура 1024, PBR включён, симметрия авто.

## 3. Герой и прохожие (нужны к S6)

| # | Файл | Описание | Лимит |
|---|---|---|---|
| 1 | `actors/hero.glb` | Молодой человек: бирюзовое пальто `#2f8a8c`, розовые накладные наушники, рюкзак. Скелет humanoid + клипы | ≤ 12 000 треугольников, текстура 1024, ≤ 1.5 МБ |
| 2 | `actors/hero-winter.glb` | Тот же герой: зимняя куртка, шапка, шарф | то же |
| 3–8 | `actors/ped-01…06.glb` | Прохожие: пожилая женщина с сумкой, мужчина в деловом пальто, студентка с рюкзаком, мужчина в куртке с капюшоном, женщина в плаще, подросток | ≤ 2 500 треугольников, текстура 512, ≤ 150 КБ |

Клипы героя (Mixamo): `Idle`, `Walking`, `Sitting Idle`, `Typing`, `Drinking`, `Talking On Phone` (как «смотрит в телефон»), `Sitting` + книга (поза «read»), `Sleeping Idle`, `Standing W_Briefcase Idle` (ожидание). Клип прохожих: только `Walking` (запекается в текстуру вершинной анимации).

**Промт референса персонажа (FLUX):**
```
Full body character turnaround sheet, front view and side view, T-pose, <CHARACTER>, stylized-realistic
proportions, matte clothing, neutral grey background, flat even lighting, no shadows, no text
```
`<CHARACTER>` героя: `young man in his twenties, teal wool coat, pink over-ear headphones around the neck, dark trousers, small grey backpack, calm face`.

## 4. Транспорт и уличные предметы (нужны к S6)

| # | Файл | Описание | Лимит |
|---|---|---|---|
| 1 | `vehicles/sedan.glb` | Обычный седан, цвет красится в шейдере (белая окраска кузова в текстуре) | ≤ 6 000 треугольников, ≤ 250 КБ |
| 2 | `vehicles/suv.glb` | Кроссовер | то же |
| 3 | `vehicles/taxi.glb` | Жёлтое такси с шашечками, без логотипов | то же |
| 4 | `vehicles/bus.glb` | Городской низкопольный электробус, сине-белый, три двери (двери отдельными объектами) | ≤ 10 000, ≤ 400 КБ |
| 5 | `vehicles/metro-car.glb` | Вагон метро современного типа, двери отдельными объектами | ≤ 10 000, ≤ 400 КБ |
| 6 | `props/street-lamp.glb` | Московский уличный фонарь | ≤ 600 |
| 7 | `props/traffic-light.glb` | Светофор с пешеходной секцией (линзы отдельными материалами) | ≤ 600 |
| 8 | `props/bench.glb`, `props/bin.glb`, `props/bus-shelter.glb`, `props/metro-entrance.glb` (павильон с буквой «М» без шрифта — буква геометрией) | Уличная мебель | ≤ 1 500 каждый |
| 9 | `props/tree-linden.glb`, `props/tree-birch.glb`, `props/tree-winter.glb` | Деревья: ствол + крона плоскостями с альфой | ≤ 800 каждый |

Требование ко всем машинам: колёса — отдельные объекты с началом координат в оси; начало координат модели — центр между осями на уровне земли; длина по +X.

**Промт референса транспорта:** `Single <VEHICLE>, three-quarter front view, neutral grey studio background, flat even lighting, no shadows, no people, no licence plate, no brand logos, clean matte paint`.

## 5. Интерьеры и салоны (нужны к S7)

Генераторы плохо собирают целые помещения. Генерировать по предмету и собирать сцену кодом; стены, пол, потолок — процедурная геометрия.

| Набор | Предметы |
|---|---|
| Метро: платформа | колонна (облицовка мрамором), люстра, скамья, табло, участок свода 6 м (тайлится) — два стиля: «Маяковская» (сталь и родонит), «Комсомольская» (жёлтый свод, лепнина) |
| Метро: вестибюль | турникет, эскалатор (секция 3 м, тайлится), балюстрада с плафоном |
| Вагон метро изнутри | секция салона 4 м (сиденья, поручни, двери), тайлится |
| Автобус изнутри | секция салона, валидатор, поручень, табло |
| Такси изнутри | передняя панель с навигатором, спинки передних сидений |
| Кафе | стойка, кофемашина, витрина, венский стул, круглый столик, подвесная лампа, меловая доска (без текста) |
| Офис | стол, монитор, кресло, стеллаж, панорамное окно-рама |
| Дом | кровать, письменный стол, кресло, торшер, книжная полка, окно-рама, растение |

Лимит: предмет ≤ 1 500 треугольников, текстура 512; набор локации целиком ≤ 1.2 МБ.

## 6. Текстуры и свет

| # | Что | Где взять | Формат |
|---|---|---|---|
| 1 | Материалы: асфальт, бетонные панели, красный кирпич, жёлтая штукатурка, гранит набережной, кровельная жесть, трава, снег, брусчатка | **Poly Haven / ambientCG (CC0)** — готовые albedo + normal + roughness | 1024, `.ktx2` |
| 2 | Если готового нет — albedo через FLUX: `Seamless tileable texture, <MATERIAL>, flat orthographic front view, uniform diffuse lighting, no shadows, no perspective, no objects, 1024x1024`; normal и roughness — из albedo в Materialize или Blender | FLUX | то же |
| 3 | HDRI для уровня Low: пасмурный день, золотой час, ночь над городом | Poly Haven | 1K `.hdr` → `.ktx2` |
| 4 | Синий шум 64×64 для зерна и дизеринга | свободные наборы blue noise (CC0) | `.png` |

## 7. Эталонные кадры (не идут в сборку)

Шесть концепт-кадров как цель для арт-директора: `assets/source/lookdev/`. Генерировать одной серией (одна модель, один seed).
```
Cinematic view of Moscow, <PLACE>, <TIME AND WEATHER>, shot on anamorphic 40mm lens, low oblique angle,
atmospheric haze between building layers, warm lit windows and sodium streetlights, volumetric light,
filmic color grade with deep indigo shadows #1b1530 and peach highlights #ffb27a, muted rose accents,
shallow depth of field, subtle film grain, stylized-realistic, no text, no logos, no watermark, 21:9
```
Кадры: Тверская — золотой час · Арбат — ночь после дождя · Зарядье и Кремль — сумерки · Москва-Сити — ночная гроза · двор в Хамовниках — снежное утро · ВДНХ — ясный полдень.

Негатив для всех промтов: `cartoon, toy, low poly, plastic, oversaturated, neon cyberpunk, text, signage letters, watermark, people, lens flare, fisheye` (для кадров §7 `people` из негатива убрать).

## 8. Сдача ассета

Для каждого файла рядом лежит `<name>.prompt.md`: сервис, модель и версия, дата, seed, промт, ссылка на условия лицензии, что правилось в Blender. Без этого файла ассет в `public/` не попадает. Запись в `ASSET_MANIFEST.md` делает `asset-pipeline-engineer` после проверки.


## 9. Генерация картинок через skill pic (HydraAI)
Код скилла прочитан целиком 16.11.2026 (`pic.py`, `render.py`, `references/`): только стандартная библиотека Python, запросы — только на `api.hydraai.ru`, ключ хранится в `~/.claude/skills/pic/.env`, в проект не попадает. Рекламные и реферальные ссылки из скилла в документы и ответы не переносятся.

**Подключение (один раз, делает пользователь; ключ в чат не вставлять):** создать файл `C:\Users\<имя>\.claude\skills\pic\.env` с одной строкой `HYDRA_API_KEY=<ключ>`, либо в обычном терминале выполнить `python %USERPROFILE%\.claude\skills\pic\scripts\pic.py setup --save` (ввод скрыт). Проверка: `PYTHONUTF8=1 python ~/.claude/skills/pic/scripts/pic.py balance`.

**Windows:** перед каждой командой обязателен `PYTHONUTF8=1` — без него скрипт падает с `UnicodeEncodeError` (консоль cp1251, проверено 16.11.2026).

**Каталог сверен с `GET /v1/models` 16.11.2026** (шире, чем в справке скилла от 04.08):
| Модель | Цена | Соотношение сторон | Для чего здесь |
|---|---|---|---|
| `z-image-turbo` | 0.5 ₽ | точное (`size`) | черновики композиции, перебор вариантов промта |
| `hydra-banana` (тир по умолчанию) | 1.1 ₽ | игнорирует, отдаёт 1:1 | квадратные текстуры и листы предметов |
| `hydra-banana-pro` (`--tier quality`) | 2.5 ₽ | обычно выполняет, без гарантии | референсы ориентиров, героя, транспорта; правка по картинке (`edit`) |
| `seedream-5.0-lite` (`--tier max`) | 5 ₽ | точное | эталонные кадры 16:9 и 21:9 (§7) |
| `gpt-image-2`, `nano-banana-2`, `nano-banana-pro` и др. | 2–9.6 ₽ | поле `size` | только через `--model <id>`, если тиры выше не дали результата |

**Команда (шаблон):**
```
PYTHONUTF8=1 python ~/.claude/skills/pic/scripts/pic.py gen "<промт из §2–§7>" --tier quality --aspect 16:9 --raw \
  --out assets/source/lookdev --name <имя> --json
```
`--raw` — чтобы пресеты скилла не дописывали промт; `--dry-run` — показать запрос и цену без списания. Результат кладётся в `assets/source/<раздел>/`, рядом — `<имя>.prompt.md` (сервис HydraAI, модель, дата, промт, цена). В `public/` картинки не идут.

**Бюджет 500 ₽ (план; факт — по `usage.cost_request`, вести в `docs/ASSET_MANIFEST.md`):**
| Что | Кол-во | Модель | ₽ |
|---|---|---|---|
| Черновики композиции и перебор промтов | 60 | z-image-turbo | 30 |
| Эталонные кадры (§7): 8 кадров × 2 варианта | 16 | seedream | 80 |
| Ориентиры (§2): 12 × 2 ракурса, с запасом на повторы ×1.5 | 36 | banana-pro | 90 |
| Герой и 6 прохожих (§3): лист спереди и сзади, с запасом | 22 | banana-pro | 55 |
| Транспорт и предметы (§4) | 12 | banana-pro | 30 |
| Интерьеры (§5): по одному концепту на локацию | 6 | seedream | 30 |
| Текстуры (§6), которых нет на Poly Haven / ambientCG | 10 | seedream | 50 |
| **Итого / резерв** | | | **365 / 135** |

Правила расхода: сначала черновик за 0.5 ₽, дорогая модель — только по утверждённой композиции; не больше 2 повторов на один объект без решения пользователя; перед каждой серией — `balance`, остаток ниже 50 ₽ — стоп и доклад. Сами 3D-модели (Meshy, Tripo, Rodin, Hunyuan3D — §1) в этот бюджет не входят.
