# TRANSITION TO 3D AND KINEMATICS — переход к 2.5D/3D, карта города и кинематика

> **Устарел частично (16.11.2026).** Разделы §1.3, §1.4, §2 (низкополигональная карта без ассетов, теней и постобработки) отменены документом `CINEMATIC_3D_PLAN.md`. §3 (кинематика SVG-персонажей) заморожен: SVG — запасной рендер. Остальное действует, где не противоречит новому плану.


Владелец реализации: `graphics-engineer`. Контракты и порядок слоёв: `architect`. Замеры и ворота: `browser-performance-engineer`. Оценка картинки: `visual-art-director`.
Версии библиотек проверены по npm на 2026-11-15; перед установкой исполнитель обязан перепроверить (`npm view <pkg> version peerDependencies`) и сверять API через Context7, а не по памяти.

---

## 0. Принцип: гибрид, а не переписывание

Текущая картинка — процедурные SVG-сцены 1600×900 на пяти Z-плоскостях (`CameraRig25D.ts`), canvas-погода, CSS-анимации. Это и есть «процедурный шарм» проекта, и он остаётся.

Трёхмерным становится то, что в плоском виде не работает:

| Слой | Технология | Статус |
|---|---|---|
| Сцены локаций (улица, парк, вагон, кафе…) | SVG + `CameraRig25D` (как сейчас) | Остаётся. Меняется кинематика (§3) и переходы (§4) |
| Карта города | WebGL: Three.js + React Three Fiber | Новое: `CityMap3D` заменяет CSS-3D карту `CityMap25D.tsx` в полноэкранном режиме |
| Пролёт «карта → сцена» (Camera Dive) | WebGL-камера + кроссфейд в SVG-сцену | Новое (§2.6) |
| Мини-радар | Остаётся CSS (`CityMap25D variant="radar"`) | WebGL для 160 px не нужен |
| Погода | 2D canvas (`WeatherRenderer.tsx`) | Остаётся |

Чего **не делаем**: не переносим SVG-сцены в полигоны, не подключаем PixiJS, не загружаем внешние `.glb`-модели, не делаем второй WebGL-контекст.

Правило из `CLAUDE.md` «не подключать Three.js без замеров» остаётся в силе: установка зависимостей — только после прохождения ворот §1.4.

---

## 1. Движок

### 1.1. Выбор

| Пакет | Версия (npm, 2026-11-15) | Решение |
|---|---|---|
| `three` | 0.187.0 | **Да.** Единственный зрелый WebGL-движок с процедурной геометрией в коде |
| `@react-three/fiber` | 9.8.2 (peer: `react >=19 <19.4`, `three >=0.156`) | **Да.** Совместим с React 19.3 проекта. Следить за верхней границей peer при обновлении React |
| `@react-three/drei` | 10.7.9 (peer: `react ^19`, `fiber ^9`) | **Да, выборочно:** `Line`, `Instances`/`Merged` не обязательны — см. §1.3 |
| `gsap` | 3.15.1 | **Нет.** Все нужные плавности закрываются `damp` из `src/utils/math.ts` и сплайном камеры; ещё одна шкала времени усложняет остановку в фоне |
| `framer-motion-3d` | снят с поддержки, peer `@react-three/fiber 8.2.2` | **Запрещён.** Несовместим с fiber 9 |
| `maath` | 0.10.8 | Не нужен: `damp`, `lerp`, `smooth` уже есть в проекте |
| `@types/three` | в паре с версией `three` | Да (dev) |

### 1.2. Почему R3F и процедурная геометрия подходят модели уровня Sonnet

1. **Декларативность.** Сцена — дерево JSX. Модель видит структуру целиком, как в React; ошибка в одном узле не ломает соседние. Императивный Three.js требует держать в голове порядок `add` / `dispose` / `needsUpdate` — типичное место ошибок.
2. **Жизненный цикл бесплатно.** R3F сам вызывает `dispose()` геометрий и материалов при размонтировании; в ручном коде это главный источник утечек GPU-памяти.
3. **Геометрия из чисел, а не из файлов.** `ExtrudeGeometry`, `InstancedMesh`, `CatmullRomCurve3`, `TubeGeometry` строятся из массивов координат, которые уже есть в `mapGeo.ts` и `transit.ts`. Результат проверяется unit-тестом (число вершин, границы, детерминированность) — без глаз.
4. **Внешние `.glb` модель проверить не может.** Она не видит сетку, не может поправить топологию, масштаб, оси, UV; любой дефект чинится только человеком в Blender. Плюс вес, лицензии, загрузчики, асинхронность. Процедурный Low-Poly даёт единый стиль с SVG-сценами и нулевую зависимость от ассетов (правило `CLAUDE.md`: внешних ассетов нет).
5. **Один способ сделать вещь.** В этом документе для каждой задачи назван один примитив. Модель не выбирает между пятью вариантами.

### 1.3. Разрешённый набор примитивов

| Задача | Примитив | Нельзя |
|---|---|---|
| Кварталы (тысячи домов) | один `THREE.InstancedMesh` + `BoxGeometry(1,1,1)` + `ShaderMaterial` (§2.3) | отдельный `<mesh>` на дом |
| Река, парки, кольца-полотна | `THREE.Shape` → `ShapeGeometry` / `ExtrudeGeometry` (малая высота) | `PlaneGeometry` с текстурой-картинкой |
| Линии метро, маршруты, план поездки | `CatmullRomCurve3` → `TubeGeometry` (радиус 1.2, 6 радиальных сегментов) | `THREE.Line` с `linewidth` (в WebGL не работает толщина) |
| Ориентиры (высотки, башни) | композиции `BoxGeometry` / `CylinderGeometry` / `ConeGeometry` / `LatheGeometry`, слитые `BufferGeometryUtils.mergeGeometries` в одну геометрию на ориентир | загрузчики моделей |
| Поезда, автобусы, герой на карте | `InstancedMesh` (до 64 штук) с матрицами из сплайнов | компонент на каждую единицу с собственным `useFrame` |
| Подписи | HTML поверх canvas (существующие билборды/пины) с проекцией координат | `Text` из drei (тянет шрифт-файл и troika) |
| Свет | один `HemisphereLight` + один `DirectionalLight`; ночь — эмиссия в шейдерах | тени, `PointLight` на каждый фонарь |
| Постобработка | нет | `EffectComposer`, bloom-проходы (в фоне сцены уже есть CSS-bloom) |

### 1.4. Ворота подключения (до `npm install`)

1. Фазы 1–3 роадмапа приняты; бюджеты `BUGFIX_AND_OPTIMIZATION_AUDIT.md` §6 выполнены на текущем рендере (есть базовая линия).
2. `security-reviewer` заполнил карточки зависимостей (`three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`).
3. Пользователь подтвердил установку (хук `guard.mjs` спросит).
4. Прототип-замер: пустой `<Canvas>` с 6000 инстансов коробок на production-сборке — FPS ≥ 55, чанк ≤ 350 КБ gzip, начальный бандл вырос ≤ 15 КБ. Не выполнено — 3D-карта делается на существующей CSS-3D карте, а разделы §2 пересматриваются.

### 1.5. Размещение в проекте

```
src/world3d/
  World3DCanvas.tsx      — единственный <Canvas>; ленивый чанк (React.lazy)
  renderGate.ts          — управление frameloop: 'always' | 'demand' | 'never'
  geo3d.ts               — сетка mapGeo (1000×1000) → мировые координаты, высоты
  CityMap3D.tsx          — состав карты
  terrain/Ground.tsx     — земля, парки
  terrain/River.tsx      — русло + шейдер воды
  terrain/Rings.tsx      — Бульварное, Садовое, ТТК
  blocks/Blocks.tsx      — InstancedMesh кварталов + шейдер окон
  blocks/blockLayout.ts  — детерминированная раскладка домов (чистая функция, тестируется)
  Landmarks3D.tsx        — силуэты ориентиров
  transit/TransitLines3D.tsx — линии метро и автобусов
  transit/Vehicles3D.tsx — поезда и автобусы на сплайнах
  HeroMarker3D.tsx       — герой и его маршрут
  camera/MapCamera.ts    — орбитальная камера карты (pan / zoom / yaw)
  camera/cameraDive.ts   — пролёт к сцене
  shaders/*.glsl.ts      — строки GLSL как константы TS
```
Зависимости: `src/world3d` читает `src/data`, `src/features/city/mapGeo.ts`, сторы и `eventProgress`. Ни `src/simulation`, ни `src/audio` не импортируют `src/world3d`.

Порядок слоёв в `App.tsx` (снизу вверх): `SceneStage` (SVG) → `World3DCanvas` (поверх сцены; виден при открытой карте и во время пролёта) → `Curtain` → UI. При закрытой карте canvas скрыт (`visibility: hidden`), `frameloop = 'never'`.

### 1.6. Управление кадрами (обязательно)

```ts
// src/world3d/renderGate.ts
export type Frameloop = 'always' | 'demand' | 'never'
export function frameloopFor(s: { hidden: boolean; mapOpen: boolean; diving: boolean; lowPerf: boolean; reduced: boolean }): Frameloop {
  if (s.hidden || (!s.mapOpen && !s.diving)) return 'never'
  if (s.lowPerf || s.reduced) return 'demand'      // кадр только по invalidate()
  return 'always'
}
```
`<Canvas frameloop={frameloopFor(...)} dpr={[1, lowPerf ? 1 : 1.5]} gl={{ antialias: !lowPerf, powerPreference: 'high-performance', alpha: true }} />`.
В режиме `'demand'` `invalidate()` вызывается: при жесте камеры, при смене события героя и раз в секунду, пока герой движется. `hidden` берётся из `onPageVisibility`. Тест `renderGate.test.ts` перебирает все 32 комбинации входов.

---

## 2. CityMap3D — трёхмерная карта Москвы

### 2.1. Система координат

Единственный источник геометрии — `src/features/city/mapGeo.ts` (сетка 1000×1000, центр = Кремль, радиальное сжатие, кольца 140 / 220 / 310 / 420). 3D-карта его не дублирует:

```ts
// src/world3d/geo3d.ts
import { MAP_CENTER, type Pt } from '../features/city/mapGeo'
/** Сетка (x вправо, y вниз) → мир (X вправо, Y вверх, Z на зрителя). 1 единица сетки = 1 единица мира. */
export const toWorld = (p: Pt, h = 0): [number, number, number] => [p.x - MAP_CENTER, h, p.y - MAP_CENTER]
export const H = { ground: 0, water: -0.6, road: 0.15, rail: 0.5, blockMin: 3, blockMax: 22, landmark: 60 } as const
```
Высоты условные, в единицах сетки: обычный квартал 3–22, ориентир до 60 (преувеличение ×3 относительно кварталов — силуэты должны читаться с высоты).

### 2.2. Рельеф

- **Земля:** круг радиуса 520, `MeshLambertMaterial`, цвет из палитры карты (`useMapPalette`).
- **Москва-река:** существующая кривая Безье реки из `mapGeo.ts` → полилиния из 96 точек → две смещённые кромки (ширина 14 в центре, 10 на окраине) → `THREE.Shape` → `ShapeGeometry`, уложенная на `H.water`. Материал — `ShaderMaterial`:

```glsl
// shaders/water.glsl.ts — fragment
uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uNight;
varying vec2 vUv; varying vec3 vWorld;
void main() {
  float w1 = sin(vWorld.x * 0.35 + uTime * 0.8) * sin(vWorld.z * 0.27 - uTime * 0.6);
  float w2 = sin((vWorld.x + vWorld.z) * 0.9 + uTime * 1.7) * 0.5;
  float ripple = smoothstep(0.55, 1.0, w1 * 0.6 + w2 * 0.4 + 0.5);
  vec3 col = mix(uDeep, uShallow, vUv.y * 0.6 + ripple * 0.25);
  col += vec3(1.0, 0.85, 0.6) * ripple * 0.18 * uNight;   // ночью блики тёплые — отражения огней
  gl_FragColor = vec4(col, 0.92);
}
```
`uTime` увеличивается только в `useFrame` (то есть не идёт при `frameloop='never'`).
- **Кольца:** Бульварное (140), Садовое (220), ТТК (310), МКАД как граница (420) — `TorusGeometry(radius, 1.4, 4, 128)`, сплюснутый по Y (`scale.y = 0.15`), на `H.road`. Бульварное — незамкнутое (подкова, разрыв на юге у реки): `arc = 4.4` рад.
- **Парки:** зелёные `ShapeGeometry` под пинами локаций `kind === 'park'` (радиус 14–26).

### 2.3. Кварталы: InstancedMesh и окна в шейдере

Раскладка — чистая функция (тестируется без WebGL):

```ts
// src/world3d/blocks/blockLayout.ts
export interface Block { x: number; z: number; w: number; d: number; h: number; rot: number; tone: number; seed: number }
/**
 * Полярная сетка: кольца шириной 16 от r=30 до r=410; в кольце дома через 14 единиц по дуге.
 * Пропускаются ячейки: в воде (расстояние до оси реки < 12), на кольцевых дорогах (|r − R| < 5),
 * в парках и в радиусе 18 от ориентиров. Высота убывает от центра и растёт возле Сити.
 */
export function layoutBlocks(seed: number, max: number): Block[]
```
Формулы внутри: `rng = mulberry32(seed)`; `h = lerp(H.blockMax, H.blockMin, smooth(r / 410)) * (0.6 + rng() * 0.8)`; у Москва-Сити (расстояние до пина `moscow-city` < 40) `h *= 2.2`; `rot = atan2(z, x) + (rng() - 0.5) * 0.3` (фасады по касательной к кольцу); `tone = rng()`. Число домов: `max = lowPerf ? 2000 : 6000`.

Отрисовка: один `InstancedMesh(BoxGeometry(1, 1, 1), material, blocks.length)`; матрица инстанса = `compose(position(x, h/2, z), quaternionY(rot), scale(w, h, d))`; атрибуты инстанса `aSeed: float`, `aTone: float` (`InstancedBufferAttribute`). Матрицы пишутся один раз в `useLayoutEffect`.

```glsl
// shaders/blocks.glsl.ts — fragment (ключевая часть)
uniform float uNight;        // 0..1 из getLighting().night
uniform vec3 uWallA; uniform vec3 uWallB; uniform vec3 uWindowLit;
varying vec3 vLocal;         // координаты в единичном кубе −0.5..0.5
varying vec3 vNormalW; varying vec3 vScale; varying float vSeed; varying float vTone;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 wall = mix(uWallA, uWallB, vTone);
  float side = abs(vNormalW.y) < 0.5 ? 1.0 : 0.0;                       // окна только на стенах
  vec2 uv = abs(vNormalW.x) > 0.5 ? vec2(vLocal.z * vScale.z, vLocal.y * vScale.y)
                                  : vec2(vLocal.x * vScale.x, vLocal.y * vScale.y);
  vec2 cell = floor(uv / vec2(1.6, 1.4));                               // сетка окон в мировых единицах
  vec2 f = fract(uv / vec2(1.6, 1.4));
  float pane = step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.8);
  float lit = step(hash(cell + vSeed * 17.0), 0.18 + 0.5 * uNight);     // доля горящих окон растёт к ночи
  float light = clamp(dot(normalize(vNormalW), normalize(vec3(0.4, 0.8, 0.3))), 0.0, 1.0) * 0.6 + 0.4;
  vec3 day = wall * light;
  vec3 col = mix(day, day * 0.28, uNight);                              // ночью стены темнеют
  col += uWindowLit * pane * lit * side * uNight * 1.4;                 // окна светятся только ночью
  gl_FragColor = vec4(col, 1.0);
}
```
`uWallA`/`uWallB` — усреднённые тона `LOCATIONS[*].theme.wall`; `uWindowLit = #ffcf8a`. `uNight` обновляется не чаще раза в секунду (значение из `getLighting`, квантованное до 0.02).

### 2.4. Ориентиры (`Landmarks3D.tsx`)

Одна слитая геометрия на ориентир, один материал на все (`MeshLambertMaterial` с `vertexColors`). Состав — из примитивов:

| Ориентир | Место (пин) | Состав |
|---|---|---|
| Сталинская высотка (МИД) | рядом с `arbat` | ступенчатая башня: 5 коробок убывающего сечения + `ConeGeometry` шпиль + 2 боковых корпуса |
| Башни «Москва-Сити» | `moscow-city` | 5 призм разной высоты (40–60), одна скрученная (`ExtrudeGeometry` с поворотом сечений), стеклянный тон `#8ea2c4` |
| Кремль | центр | зубчатая стена — `ExtrudeGeometry` по треугольному контуру, 5 башен: коробка + `ConeGeometry` шатёр `#3f6b4a`, колокольня-цилиндр с золотой главой |
| Храм Христа Спасителя | у `1-kropotkinskaya` | куб + 5 полусфер (`SphereGeometry` с `phiLength` полушария), золото `#e6b84c` |
| Арка и павильон ВДНХ | `vdnh` | арка из 3 коробок + шпиль павильона; ракета — `LatheGeometry` |
| Останкинская башня | севернее `vdnh` | `LatheGeometry` по профилю (широкое основание → игла), высота 90 |
| Шуховская башня | у `6-shabolovskaya` | 5 усечённых конусов-каркасов (`CylinderGeometry` с `wireframe`-материалом) |
| Парящий мост Зарядья | `zaryadye` | дуга `TubeGeometry` по V-образной кривой над рекой |
| Колесо/арка Парка Горького | `gorky-park` | портал из 3 коробок с колоннами |

Требование `visual-art-director`: каждый ориентир узнаётся по силуэту на скриншоте карты при zoom 1 днём и ночью.

### 2.5. Транспорт и герой на карте

- **Линии метро:** для каждой линии `METRO_LINES` — точки станций `nodeGrid(platformNode(id))` → `CatmullRomCurve3(points, ring, 'catmullrom', 0.3)` → `TubeGeometry(curve, stations * 12, 1.2, 6, ring)` на `H.rail`; цвет линии из `transit.ts`. Станции — `InstancedMesh` цилиндров (радиус 2.2). Автобусные коридоры — то же, радиус 0.7, на `H.road + 0.1`.
- **Поезда и автобусы (фоновая жизнь):** `InstancedMesh` коробок 6×2×2 (поезд из 3 инстансов подряд). Число — `Math.round(2 * activityLevel(minutes).transit)` на линию метро, 1 на автобусный коридор; ночью (метро закрыто) поездов 0. Положение: `u = fract(phase_i + tGame / lapMin_i)`, где `lapMin` — время круга по линии из рёбер графа; `curve.getPointAt(u)` и `curve.getTangentAt(u)` → матрица. Векторы — модульные константы, без `new` в кадре.
- **Герой:** маркер (конус + пульсирующее кольцо) в точке `pointAt(legPath(event.from, event.to, line), getEventProgress())` — те же функции, что использует `useHeroGeo`, но вызываются в `useFrame`, а не в рендере React. Если герой в метро — маркер едет вместе с отдельным «своим» поездом по трубке линии.
- **Маршрут героя:** `worldStore.plan` → `TubeGeometry` поверх линий (радиус 1.8, эмиссия, анимация штриха сдвигом `uTime` в шейдере). Пересобирается только при смене `plan`.
- **Пины локаций:** остаются HTML-билбордами (`MapPinArt.tsx`); позиция — проекция `toWorld(pin.pos)` камерой в координаты экрана, запись в `style.transform` по ref раз в кадр, только при изменении матрицы камеры.

### 2.6. Камера и Camera Dive

Камера карты (`MapCamera.ts`): перспективная, `fov = 35`, смотрит на точку `target` на земле; параметры `{ target: Vector3, distance: 300..1100, yaw, pitch: 38°..62° }`; жесты те же, что у текущей карты (перетаскивание — pan, колесо — zoom, кнопки — yaw). Сглаживание — `damp(value, goal, 6, dt)` по каждому параметру. Императивный API совпадает с `MapViewHandle` (`zoomBy`, `yawBy`, `reset`, `focus`, `getZoom`) — `CityMapHub.tsx` не меняется.

**Camera Dive** — пролёт «с высоты птичьего полёта в сцену»:

```ts
// src/world3d/camera/cameraDive.ts
export interface DivePlan { curve: THREE.CatmullRomCurve3; look: THREE.CatmullRomCurve3; durationMs: number }
/** from — текущая поза камеры; anchor — мировая точка локации или движущегося поезда героя. */
export function planDive(fromPos: Vector3, fromLook: Vector3, anchor: Vector3, kind: 'street' | 'train'): DivePlan
```
- Траектория позиции: 4 контрольные точки — старт; точка над целью на высоте `0.45 * старт.y`, смещённая на 60 назад по направлению взгляда; точка на высоте 30; финиш на высоте 6 (уровень «глаз» над улицей) в 14 единицах от цели. Траектория взгляда: старт-взгляд → цель → цель.
- Время: `durationMs = 1600` (`prefers-reduced-motion`: 0 — мгновенная смена с кроссфейдом 200 мс).
- Параметр: `u = easeInOutCubic(t / durationMs)`; `position = curve.getPoint(u)`; `lookAt(look.getPoint(u))`; `fov = lerp(35, 55, smooth(max(0, (u − 0.6) / 0.4)))` — в конце «расширение» для ощущения скорости.
- Кроссфейд: при `u ≥ 0.72` прозрачность WebGL-слоя идёт 1 → 0, а SVG-сцена под ним проявляется с масштабом 1.18 → 1 и точкой трансформации в экранной проекции цели (существующий класс `.scene-arrive`, длительность выровнять с остатком пролёта). Чёрного кадра нет: сцена уже отрисована под canvas.
- Вариант `'train'` (герой едет в метро): цель — поезд героя; финиш — вплотную к окну вагона (3 единицы сбоку, высота 2), сцена под ним — `MetroRideScene`; кроссфейд начинается при `u ≥ 0.8`.
- Обратный пролёт (сцена → карта, открытие карты): тот же план в обратном порядке, 1100 мс.
- После завершения: `mapStore.endDive()` (существующий), `frameloop → 'never'`.

`easeInOutCubic(x) = x < 0.5 ? 4x³ : 1 − (−2x + 2)³ / 2`.

---

## 3. Кинематика персонажа и транспорта (в SVG-сценах)

### 3.1. Один хаб анимации

Сейчас движение — CSS-keyframes (`w-thigh`, `w-shin`, `walk-bob`, `car-rock`, `ent-move` в `index.css`). Они не знают скорости, погоды и времени симуляции. Замена — покадровый расчёт в одном цикле:

```ts
// src/scenes/kinematics/animationClock.ts
type Tick = (dt: number, tSec: number) => void      // dt ≤ 0.1 с (clampDelta)
export function onFrame(fn: Tick): () => void        // подписка; возвращает отписку
```
Один `requestAnimationFrame`; стартует при первой подписке, останавливается при нуле подписчиков и при скрытой вкладке (`onPageVisibility`); `lowPerf` — вызов подписчиков через кадр (30 fps). `CameraRig25D`, `WeatherRenderer`, `Visualizer` переводятся на этот хаб (в проекте остаётся ровно один `requestAnimationFrame` вне WebGL).

Запись результата — в `element.style.transform` / `setAttribute('transform', …)` по ref. React не участвует. Строки трансформаций собираются только при изменении значения больше порога (0.05° / 0.1 px).

Кто получает полную кинематику: герой и до 6 прохожих на ближней полосе (y ≥ 760). Остальные прохожие остаются на CSS-цикле (бюджет кадра).

### 3.2. Походка: фаза, шаг, отсутствие скольжения

Масштаб: рост фигуры 150 единиц ≈ 1.72 м → `UNITS_PER_M = 87`. Длина ноги `L1 + L2`, где `L1 = KNEE − HIP = 37` (бедро), `L2 = 33` (голень до лодыжки; лодыжка на высоте `ANKLE = 6` над землёй) — константы взять из `Person.tsx`, не вводить новые.

Входы: `v` — скорость тела, м/с (из события: `event.meters / eventRealSeconds`, по умолчанию `1.35 * k_weather`); `s` — масштаб фигуры в сцене.

```
Частота шагов (шагов в секунду):  f = 1.55 + 0.26 * v            // 1.35 м/с → 1.90 Гц (114 шаг/мин)
Длина шага, м:                     ℓ = v / f                       // 1.35 м/с → 0.71 м
Длина шага, единицы фигуры:        ℓu = ℓ * UNITS_PER_M            // ≈ 62
Экранная скорость тела, px/с:      vpx = v * UNITS_PER_M * s
Фаза цикла (2 шага):               φ += f / 2 * dt   (φ ∈ [0, 1), левая нога; правая = φ + 0.5)
```
**Условие отсутствия скольжения:** экранное перемещение тела за время опоры одной ноги равно пути стопы относительно таза: `vpx / s = ℓu * f`. Оно выполняется тождественно, если `ℓ = v / f`. Следствие для `Hero.tsx`: длительность перехода по сцене = `|x1 − x0| / vpx`, а не `event.duration`; если событие длиннее — герой идёт на месте с прокруткой окружения (§3.6) либо проходит кадр несколько раз в рамках одной фазы.

Траектория стопы относительно таза (ось x — вперёд, y — вниз, земля на y = `HIPH`, `HIPH = −HIP − bob`):
```
доля опоры β = 0.62
опора   (φ < β):   u = φ / β;               footX = ℓu * (0.5 − u);                 footY = ground
перенос (φ ≥ β):   u = (φ − β) / (1 − β);   footX = ℓu * (−0.5 + smooth(u));        footY = ground − hLift * sin(π u)
hLift = 0.07 * (L1 + L2) * clamp(v / 1.35, 0.5, 1.3)
```
Перекат стопы: угол стопы `θfoot = lerp(−12°, 0°, smooth(u * 4))` в начале опоры (пятка), `0°` в середине, `lerp(0°, 28°, smooth((u − 0.7) / 0.3))` в конце опоры (носок), в переносе возвращается к `−12°`.

Таз: `bob = A * cos(4π φ)`, `A = 2.3 * clamp(v / 1.35, 0.4, 1.2)` — нижняя точка в двойной опоре. Наклон корпуса вперёд: `θtorso = 2° + 3° * (v / 1.35) + θwind` (§3.4). Голова: `θhead = −0.6 * (θtorso − 2°) + 1.2° * sin(4π φ)` — компенсирует наклон, слегка кивает. Руки: плечо `θarm = ∓17° * clamp(v / 1.35, 0.3, 1.2) * sin(2π φ)` в противофазе с ногой той же стороны; предплечье `−10° − 12° * (1 + sin(2π φ + π/2)) / 2`.

### 3.3. Обратная кинематика ноги (две кости, аналитически)

Соглашение об углах из `Person.tsx` (`seg`): угол 0 — сегмент вниз, отрицательный — вперёд (+x); конец сегмента длины `L` из точки `(x, y)` под углом `a`: `(x − L sin a, y + L cos a)`.

```ts
// src/scenes/kinematics/ik2.ts
const out = { thigh: 0, shin: 0 }                   // переиспользуемый результат — без аллокаций
/** hip → foot в координатах фигуры; колено сгибается вперёд. Углы в градусах в соглашении Person.tsx. */
export function solveLeg(dx: number, dy: number, L1: number, L2: number): { thigh: number; shin: number } {
  const dRaw = Math.hypot(dx, dy)
  const d = Math.min(L1 + L2 - 0.01, Math.max(Math.abs(L1 - L2) + 0.01, dRaw))
  const base = Math.atan2(-dx, dy)                                        // направление hip→foot в соглашении seg
  const a = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))         // угол при бедре
  const b = Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))        // внутренний угол колена
  const thigh = base - a                                                  // бедро отклоняется вперёд
  out.thigh = (thigh * 180) / Math.PI
  out.shin = ((thigh + (Math.PI - b)) * 180) / Math.PI                    // абсолютный угол голени
  return out
}
```
Тест `ik2.test.ts`: для 200 случайных целей в досягаемости конец цепочки (через `seg`) совпадает с целью с точностью 0.05; колено всегда впереди линии бедро–стопа; при недосягаемой цели нога выпрямляется без `NaN`.

### 3.4. Пружины: реакция на ветер, дождь, остановку

```ts
// src/scenes/kinematics/spring.ts
export interface Spring { x: number; v: number }
/** Полунеявный Эйлер; k — жёсткость (1/с²), c — демпфирование (1/с). Критическое: c = 2√k. */
export function stepSpring(s: Spring, target: number, k: number, c: number, dt: number): void {
  const n = dt > 1 / 120 ? Math.ceil(dt * 120) : 1          // подшаги: устойчивость при 30 fps
  const h = dt / n
  for (let i = 0; i < n; i++) {
    s.v += (-k * (s.x - target) - c * s.v) * h
    s.x += s.v * h
  }
}
```

| Что | Цель пружины | k | c |
|---|---|---|---|
| Наклон корпуса от ветра `θwind` | `−8° * wind * dir` (`dir` = +1, если идёт против ветра; ветер дует слева направо) | 30 | 9 |
| Наклон зонта | `clamp(22° * wind + 6° * rain, 0°, 30°)` навстречу ветру | 40 | 7 (с лёгким перелётом) |
| Опускание головы в дождь без зонта | `10° * rain` | 25 | 10 |
| Поворот тела по вектору движения (смена направления) | `scaleX` от −1 до 1 через 0 (плоский разворот) + наклон `6° * sign` | 60 | 15.5 (критическое) |
| Посадка: высота таза `HIP → HIP_SIT` | `HIP_SIT = −46` | 45 | 11 (один мягкий «присест») |
| Колени при посадке | из IK по текущей высоте таза, стопы остаются на месте | — | — |

Дискретные реакции позы (через `deriveLook`, без пружин): поднятый воротник при `temperature < 5` или `wind > 0.5`; шарф и шапка — как сейчас; руки в карманах (поза рук `wait`) при `temperature < −5`.

Порядок посадки на скамью/сиденье вагона: (1) герой доходит до точки `seatX − 14`; (2) разворот пружиной; (3) таз по пружине вниз и назад на 14 единиц, ноги — IK; (4) поза рук по событию. Время шагов 2–4 ≈ 1.2 с. Вставание — в обратном порядке.

### 3.5. Транспорт: профиль скорости и подвеска

Профиль скорости фазы (общий для сцены вагона, автобуса, такси и для панорамы за окном):

```ts
// src/scenes/kinematics/vehicleSuspension.ts
/** Нормированная скорость 0..1 и ускорение по фазе data-ride (REALTIME spec §9) и прогрессу события p ∈ [0,1]. */
export function rideSpeed(ride: 'accel' | 'cruise' | 'brake' | 'dwell' | 'stop', p: number): number {
  if (ride === 'accel') return smooth(p)
  if (ride === 'brake') return 1 - smooth(p)
  if (ride === 'cruise') return 1
  return 0
}
```
Смещение панорамы: `pan += vmaxPx * rideSpeed * dt`; после возврата из фона `pan` восстанавливается как интеграл профиля по `getEventProgress()` (замкнутая формула: для `accel` интеграл `smooth` = `p³ − p⁴/2`, для `brake` — `p − p³ + p⁴/2`, умножить на `vmaxPx * getEventRealMs() / 1000`).

Подвеска кузова — три пружины, возбуждаемые движением:

| Степень свободы | Возбуждение | k | c | Амплитуда (ограничить) |
|---|---|---|---|---|
| Тангаж `pitch` (клевок) | цель `−κ * a`, где `a = d(rideSpeed)/dt` — продольное ускорение; `κ = 1.6°` метро, `2.4°` автобус, `1.2°` такси | 50 | 6 | ±3° |
| Вертикаль `heave` | импульс скорости `+J` на каждом стыке: стыки каждые 25 м пути → интервал `25 / (vmax_mps * rideSpeed)` с; `J = 14` px/с метро; автобус — случайные неровности по seeded rng, в среднем раз в 1.8 с, `J = 20` | 180 | 9 | ±2.5 px |
| Крен `roll` (повороты) | цель `ρ * rideSpeed² * curve(t)`, `curve` — медленная функция из seeded шума со значениями −1..1, смена раз в 6–14 с; `ρ = 0.8°` метро, `1.5°` автобус | 20 | 6 | ±1.8° |

`vmax_mps`: метро 16.7, автобус 6.9, такси 9.7 (те же константы, что в симуляции). Кузов (план `actor` сцены) получает `translateY(heave) rotate(pitch + roll)` с центром вращения у колёсной базы. Пассажиры стоя (`pose='hold'`/`'pole'`) качаются с запаздыванием: отдельная пружина на корпус с целью `−0.6 * pitch` (k = 25, c = 5); поручни-ремни — маятник: цель `−1.5 * pitch − 2 * roll`, k = 35, c = 2.5 (долго затухают). Колёса наружного транспорта (`Vehicles.tsx`): угол `+= v_px / r * dt`; при `still` не вращаются (вместо бесконечной CSS-анимации `tunnel-spin`).

Двери: створка — пружина к цели 0 (закрыто) или 1 (открыто), k = 60, c = 13 (без перелёта), ход 104 px (метро) / складывание `scaleX 1 → 0.08` (автобус). Открытие — в начале `dwell`; закрытие начинается за 3 реальные секунды до конца фазы (совпадает со звуком `doors-close`, см. REALTIME spec §7).

### 3.6. Поток пассажиров и пул сущностей

- `EntityLayer.tsx`: фиксированный пул из 22 слотов. Слот — постоянный `<g>` с `<Person>` или `<Vehicle>`; при «спавне» слоту задаются палитра/параметры (один `setState` на слот — допустимо, это не покадрово) и стартовые `x, y, v`; позиция далее пишется хабом `animationClock` в `transform`. Освобождение — когда `x` вышел за кадр. Таймеров `setTimeout` на удаление нет; `performance.now()` для позиции не используется — позиция интегрируется из `dt`, поэтому в фоне сущности просто стоят.
- Обмен пассажиров в фазе `dwell` (вагон и автобус): `nOut = round(2 + 4 * activity.pedestrians)` фигур выходят (идут к двери, масштаб/прозрачность → 0 в проёме), затем `nIn` входят и встают на свободные точки `hold`/`pole`. Берутся из отдельного пула 8 слотов сцены транспорта. Очерёдность: первые 40 % фазы — выход, 40–85 % — вход, остаток — двери закрываются. При реальной длительности фазы < 4 с обмен не проигрывается.
- Прохожие на светофоре: в фазе `waiting-for-green-light` до 4 фигур из пула останавливаются у бордюра рядом с героем и начинают переход вместе с ним.

---

## 4. Бесшовные пространственные переходы

### 4.1. Что есть
Смена локации = занавес: `ScenarioEngine.playNext` ставит `transitionTo`, через `FADE_OUT_MS = 650` применяет событие; `Curtain` в `Overlays.tsx` затемняет экран. `LocationTransitionManager.ts` — только обёртка `planTravel`.

### 4.2. Что будет
Занавес остаётся запасным вариантом (`cut`). Для связанных по смыслу пар фаз — непрерывный проход камеры. Вид перехода определяется парой (предыдущая фаза → следующая фаза):

```ts
// src/scenes/transitions/transitionKind.ts
export type TransitionKind = 'none' | 'cut' | 'push-in' | 'descend' | 'ascend' | 'slide' | 'pull-out'
export function transitionKind(prev: ScenarioEvent | null, next: ScenarioEvent): TransitionKind
```

| Откуда → куда | Вид | Что видит зритель | Длительность |
|---|---|---|---|
| Та же `location` | `none` | Ничего (только смена позы/фазы) | 0 |
| Улица (`metro-approach`) → `metro-vestibule` | `push-in` | Герой подходит к дверям павильона; камера наезжает на двери (масштаб 1 → 1.6 с центром в проёме), проём заполняет кадр и растворяется в вестибюле | 900 мс |
| `metro-turnstile` → `metro-escalator-down` → платформа | `descend` | Обе картинки сдвигаются вверх: уходящая уезжает за верх кадра, платформа поднимается снизу; наклонные светильники эскалатора между ними | 1100 мс |
| Платформа (`metro-boarding`) → вагон (`metro-departure`) | `slide` | Камера въезжает в открытые двери поезда: масштаб 1 → 1.35 к дверям, кроссфейд в салон, где те же двери закрываются | 800 мс |
| Вагон (`metro-arriving`) → платформа (`metro-alighting`) | `slide` (обратный) | Из салона через двери наружу | 800 мс |
| Платформа → `metro-escalator-up` → `metro-exit` → улица | `ascend` | Зеркально `descend`; в конце дневной свет из проёма | 1100 мс |
| Остановка (`bus-boarding`) → салон (`bus-validate`) | `slide` | Через переднюю дверь автобуса | 800 мс |
| Улица → здание (`building-enter` → занятие в кафе/офисе/доме) | `push-in` | Наезд на дверь/окно здания | 900 мс |
| Здание → улица | `pull-out` | Отъезд от двери: масштаб 1.6 → 1 | 900 мс |
| Всё остальное (в том числе `silent`-перемотка и `goTo` без связи) | `cut` | Занавес, как сейчас | 650 мс |

### 4.3. Реализация

- `worldStore` получает поле `transition: { to: LocationId; kind: TransitionKind; anchor: { x: number; y: number }; ms: number } | null` (добавляет architect). `transitionTo` остаётся и заполняется как раньше (`transition?.to ?? null`) — на него подписан звук (`AudioLifecycleManager`).
- `ScenarioEngine.playNext`: `kind = transitionKind(this.current, ev)`; задержка применения события — `ms` выбранного вида вместо константы `FADE_OUT_MS`. При `none` — мгновенно (как сейчас для одинаковой локации). При реальной длительности следующего события < 2 с вид принудительно `none`/`cut` без анимации (режим 60×).
- `SceneStage.tsx`: на время перехода смонтированы **две** сцены — уходящая и входящая (входящая строится для `transition.to`), каждая в своём слое. `SceneTransitionDirector` (`src/scenes/transitions/SceneTransitionDirector.ts`) через `animationClock` пишет трансформации и прозрачности двух слоёв по таблице; по окончании уходящая размонтируется. Вне перехода смонтирована одна сцена — бюджет DOM не растёт.
- Якорь `anchor` — точка в координатах 1600×900, куда «летит» камера: экспортируется сценами как константа (`METRO_DOOR_ANCHOR`, `BUS_DOOR_ANCHOR`, `PAVILION_DOOR_ANCHOR`, `CAFE_DOOR_ANCHOR`…).
- Формулы (p — прогресс 0..1, `e = easeInOutCubic(p)`):
  - `push-in`: уходящая `scale(1 + 0.6e)` с `transform-origin = anchor`, `opacity 1 → 0` на `p ∈ [0.55, 1]`; входящая `scale(1.25 − 0.25e)`, `opacity 0 → 1` на `p ∈ [0.45, 1]`.
  - `pull-out`: зеркально.
  - `descend`: уходящая `translateY(−100% * e)`; входящая `translateY(100% * (1 − e))`; между ними полоса высотой 22 % кадра с повторяющимися светильниками (один `div` с градиентом, едет вместе).
  - `ascend`: знаки наоборот.
  - `slide`: уходящая `scale(1 + 0.35e)` к якорю двери, `opacity → 0` на `p ∈ [0.5, 1]`; входящая `scale(1.15 − 0.15e)`, `opacity 0 → 1` на `p ∈ [0.4, 0.9]`.
- Звук: `city.beginTransition()` / `endTransition()` вызываются по `transitionTo`, как сейчас; провал эмбиента для видов кроме `cut` — мельче (−3 дБ вместо текущего), длительность кроссфейда = `ms`. Смена акустического пространства — `BUGFIX_AND_OPTIMIZATION_AUDIT.md` §4.4.
- `prefers-reduced-motion` и `lowPerf`: все виды заменяются кроссфейдом 300 мс без масштабирования.
- Скрытая вкладка: переход не анимируется, событие применяется сразу (`ms = 0`).

### 4.4. Сквозной пример «улица → вагон»
`metro-approach` (герой идёт к павильону) → **push-in** в двери → `metro-vestibule` → `metro-turnstile` (та же сцена станции, `none`) → **descend** → `metro-platform-wait` → `metro-train-arrival` (поезд въезжает, `none`) → `metro-boarding` → **slide** в двери → `metro-departure` (двери закрываются изнутри, разгон по §3.5). Ни одного чёрного кадра; суммарно три анимированных перехода по 0.8–1.1 с.

---

## 5. Тесты и приёмка

| Файл | Проверяет |
|---|---|
| `src/scenes/kinematics/ik2.test.ts` | §3.3 |
| `src/scenes/kinematics/spring.test.ts` | сходимость к цели; устойчивость при `dt = 0.1`; критическое демпфирование без перелёта |
| `src/scenes/kinematics/gait.test.ts` | `ℓ * f = v` для v ∈ [0.6, 2.0]; стопа в опоре неподвижна относительно земли (скольжение ≤ 3 %); `f(1.35) = 1.90 ± 0.01` |
| `src/scenes/kinematics/vehicleSuspension.test.ts` | интеграл профиля = аналитической формуле; амплитуды в пределах таблицы за 60 с симуляции |
| `src/scenes/kinematics/animationClock.test.ts` | один rAF; остановка при hidden; `dt ≤ 0.1` |
| `src/scenes/transitions/transitionKind.test.ts` | каждая строка таблицы §4.2; `silent` → `cut` |
| `src/world3d/blocks/blockLayout.test.ts` | детерминированность по seed; ни одного дома в воде/на кольце; число ≤ `max` |
| `src/world3d/renderGate.test.ts` | все 32 комбинации |
| `src/world3d/camera/cameraDive.test.ts` | траектория монотонно снижается; конец в 14 ± 0.5 от цели; длительность 1600 |
| `e2e/map3d.spec.ts` | карта открывается, canvas не пуст (не одноцветный), герой виден, «Перейти в сцену» завершает пролёт; в скрытой вкладке кадров WebGL 0 |
| `e2e/transitions.spec.ts` | при `?time=x15` в поездке на метро атрибут `data-transition` проходит `push-in → descend → slide`; непрозрачность занавеса всё время 0 |
| `e2e/visual.spec.ts` | эталоны сцен пересняты осознанно после вердикта арт-директора; новые эталоны: `map3d-day`, `map3d-night` |

Бюджеты — `BUGFIX_AND_OPTIMIZATION_AUDIT.md` §6. Критерии готовности — `MASTER_EXECUTION_ROADMAP.md`, Фазы 3–5.

---

## 6. Порядок работ (шаги ≤ 3 файлов)

**Кинематика (Фаза 3, без новых зависимостей):**
1. `animationClock.ts` + тест; перевести `CameraRig25D` на хаб.
2. `spring.ts`, `ik2.ts` + тесты.
3. `gait.ts` + тест; `Person.tsx`: режим `rig` — конечности получают ref и не имеют CSS-классов анимации (старый режим остаётся для дальних прохожих).
4. `Hero.tsx`: движение от `getEventProgress()` и формулы §3.2; ветер, зонт, посадка.
5. `EntityLayer.tsx`: пул слотов, позиция от хаба.
6. `vehicleSuspension.ts` + тест; `MetroScenes.tsx`: `data-ride`, профиль скорости, подвеска, двери; удалить цикл 64 с.
7. `TransportScenes.tsx`: то же для автобуса и такси; удалить `useRideCycle`.
8. Обмен пассажиров в `dwell`; прохожие на светофоре (`OutdoorScene.tsx`, `StreetKit.tsx`).

**3D (Фаза 4, после ворот §1.4):**
9. Установка зависимостей (подтверждение пользователя), `World3DCanvas.tsx`, `renderGate.ts`, замер прототипа.
10. `geo3d.ts`, `terrain/*`. 11. `blockLayout.ts`, `Blocks.tsx`, шейдер. 12. `Landmarks3D.tsx`. 13. `TransitLines3D.tsx`, `Vehicles3D.tsx`, `HeroMarker3D.tsx`. 14. `MapCamera.ts`, подключение в `CityMapHub.tsx` вместо `CityMap25D variant="full"`.

**Пролёт и переходы (Фаза 5):**
15. `cameraDive.ts` + кроссфейд. 16. `transitionKind.ts`, поле `transition` в сторе, `ScenarioEngine.playNext`. 17. `SceneTransitionDirector.ts`, две сцены в `SceneStage.tsx`. 18. Якоря дверей в сценах, вид за видом по таблице §4.2.

После каждого шага: `npm run verify`; после шагов, меняющих картинку: `node scripts/shots.mjs` + просмотр + `npm run e2e:visual`.
