---
name: moscow-visual-art-direction
description: Art direction and style guide for MOSCOW LIFE visuals — "Premium cinematic 2.5D city diorama" of Moscow rendered as procedural SVG (+ canvas weather). Use this skill whenever adding or changing anything visible in a scene: buildings, landmarks, characters, vehicles, interiors (metro, bus, taxi, cafe, office, home), sky, lighting, weather look, palette, perspective, depth, materials, grain/bloom/vignette, or when judging whether a screenshot "looks right". Also use when the user says the picture looks cheap, flat, generic, AI-like, prototype-like, or "не в стиле".
---

# MOSCOW LIFE — Visual Art Direction (2.0)

Концепция: **PREMIUM CINEMATIC 2.5D CITY DIORAMA** — кадр из атмосферного анимационного фильма / narrative indie game о Москве. Мягкий hand-painted рендер, выразительный свет, глубина, узнаваемые места. Не детская мультяшность, не плоский flat-design, не «SVG-интерфейс», не фотоколлаж, не пластик.

## Холст и планы
- SVG 1600×900, `xMidYMax slice` (обрезается небо, а не земля). Нижняя панель UI закрывает y≈810–890: стопы фигур ≤ 800.
- Каждая большая сцена собрана из планов `SceneShell` (каждый — свой композитный слой): sky → clouds (CloudDeck) → back (архитектура) → underlay (`PanPlane`: город за окнами транспорта) → mid (окружение) → art (земля, пропсы, персонажи) → fore (передний план, сильный параллакс) → tint (multiply) → grade → lights (screen) → bloom (только источники) → paint-tex (фактура мазка) → weather (canvas) → vignette + grain.
- Параллакс: `--px/--py` двигают div-планы (композитор). Объекты, которые по перспективе ближе, обязаны перекрывать дальние: на улице — `DepthStack` по y основания, толпа полосами (`EntityBand`) между пропсами.

## Перспектива по типам сцен
- Улица/парк/двор: фронтальная, слабая; глубина — масштаб, дымка (`--fog`, `atmo`), насыщенность вдаль.
- Вагон метро и салон автобуса: камера у прохода, смотрит на борт; дальняя стена с вырезами окон (evenodd), за ней отдельный план (тоннель/станция/`PanPlane`-город). Пассажиры на сиденьях вдоль борта — `view='front'`.
- Такси: вид с заднего сиденья; дорога в центральной перспективе (точка схода `VP`), разметка и фонари бегут CSS translate+scale; спинки кресел и водитель — ближайший план.

## Свет (отдельная профессиональная задача)
- Только CSS-переменные LightingController: `--night, --lamps, --golden, --bright, --grade, --tint, --wet, --snow, --cloud, --fog, --rain, --day, --overcast`. Ни одного ререндера React ради света.
- У каждого источника есть происхождение: окна, фонари, фары, витрины, неон, плафоны метро, экраны. Источник = яркое пятно в art + ореол/конус в lights (screen) + маленькое пятно в bloom. Ореолы — радиальные градиенты (`glow-warm/soft/cool/white/red/amber/green`), никогда не сплошные круги.
- Ночь — локальные тёплые акценты и холодные тени, а не общая темнота. Мокрый асфальт — вытянутые отражения источников (`refl-warm`, `wet-sheen`), а не полосы через разметку.
- Контактные тени (`#contact`, `Contact`) под каждой фигурой/ножкой мебели; AO в углах (`ao-down/ao-up`).

## Материалы (`src/scenes/art/materials.tsx`)
Разные материалы — разная обработка: металл (`metal-v/h`, `brushed-*`, `dark-metal-v`, `brass-v`, `yellow-rail`), стекло (`glass-day/dark`, блики-трапеции, отражения салона сильнее ночью), ткань (`pat-moquette`, складки), дерево (`pat-planks`), кирпич (`pat-brick`), плитка (`pat-tiles`, `pat-paving`), резина (`pat-rubber`), фактуры — растровые тайлы `TEX` через `Texture`. Объём — оверлеи `shade-x/shade-y`, а не новые цвета. Живые SVG-фильтры на больших площадях запрещены (перерисовка всего слоя).

## Палитра
UI: ink `#1b1530`, dusk `#2a2150`, peach `#ffb27a`, rose `#f06a8f`, cream `#fff3e2`. Сцены: небо из `--sky-*`, тёплые окна `#ffd27a/#ffe7b0` (`win-warm`), холодные тени `#7a8cc0`. Без чистого чёрного/белого.

## Персонажи (`Person.tsx`)
~7 голов, двухсегментные конечности, вариации возраста/телосложения/одежды/сумок/причёсок/бороды/очков (`randomPalette`), одежда по погоде (`deriveLook`). Позы: walk, stand, sit, read, phone, drink, listen, wait, hold (поручень над головой), pole (вертикальная стойка, кисть ≈ (46,−119) в единицах фигуры), doze, window, type. Сидячие: таз на −46, сиденье на −44 в единицах фигуры ×scale. Герой — бирюзовое пальто, розовые наушники, каре.

## Транспорт и фазы поездки
Сцены отражают фазы `event.phase` без телепортов: ожидание (пустой путь/остановка), прибытие (`.train-in`, `.veh-pull-in`), двери (`.doors-open`, `data-door`), посадка/выход (`.board-in/.board-out`), остановки (`data-stopped` ставит город за окном на паузу и зажигает стоп-сигналы). Табло — настоящая типографика с данными события (`event.line/station/nextStation/trip`).

## Погода (`WeatherRenderer`)
Дождь 3 слоя глубины + брызги, снег 3 слоя (ближний — боке), капли на стекле только внутри `glass`-прямоугольников сцены, туман 3 слоями, молния = вспышка + разряд (eventBus `lightning`). Пулы частиц, пауза при `document.hidden`, lowPerf.

## Растровые ассеты
Генератора изображений в проекте нет; ничего не выдаём за созданное. Список нужного и промпты — `ASSET_REQUESTS.md`, правила — `ASSET_PIPELINE.md`, реестр — `ASSET_MANIFEST.md`. Текст/UI/маршруты в картинку не запекаем — только программно.

## Право вето
Отклоняй решение, если оно: вводит другой стиль рендера; ломает палитру; добавляет «шаблонный AI-дизайн» (глянцевые карточки, glassmorphism в сцене, случайный неон); создаёт наложения/обрезки/неверный z-order; сплошные круги-ореолы; плоские заливки без материала; «висящие» ноги и тела. Вердикт: **ПРИНЯТЬ / ДОРАБОТАТЬ / ОТКЛОНИТЬ** + правки P0 (ломает кадр) / P1 (заметно) / P2 (полировка).

## Как проверять
`npm run dev`, затем `node scripts/shots.mjs` → `D:/dev-cache/tmp/shots` (или одиночный кадр `scripts/_shot1.tmp.mjs`). `window.__ml(location, weather, minutes)`; фазы — патч `useWorldStore.setState({ event: { ...event, phase, mode, station, line } })` (модуль `/src/stores/worldStore.ts` в dev). Минимум день/вечер/ночь × ясно/дождь/снег/туман/гроза для изменённой локации; матрица — skill moscow-visual-qa.
