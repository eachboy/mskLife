# REALTIME TRANSIT AND MOVEMENT SPEC — реальное время 1:1 и микро-фазы пути

Владелец реализации: `world-simulation-engineer`. Контракт (типы, сторы): `architect`. Потребители: `graphics-engineer` (§9), `audio-engineer` (§7), `frontend` (§8).
Все числа в этом документе — модель для симуляции, а не данные перевозчика. Правило для исполнителя: числа и формулы переносятся в код без изменений; любое отклонение — отдельным решением architect с записью в `PROGRESS.md`.

---

## 0. Что есть сейчас и что меняется

| Тема | Сейчас (файл) | Станет |
|---|---|---|
| Масштаб времени | Неявно 60×: `ScenarioEngine.tick` прибавляет `dt` секунд как игровые минуты (`ScenarioEngine.ts:222`); `Hero.tsx:61` и `TravelSoundEngine.onPhase` считают `event.duration` секундами | Явный `timeScale` ∈ {1, 5, 15, 60}; единственная функция перевода `eventRealSeconds` |
| Шаг часов | `dt = Math.min(1, …)` от `performance.now()` (`ScenarioEngine.ts:207`) — разрыв таймера теряет время | Шаг от `Date.now()` без клампа + бесшумная перемотка пропущенных событий |
| Пеший путь | `WALK_KMH = 4.6`, `walkSlowdown` 1.05–1.15 (`router.ts:76`) | 1.35 м/с × погодный коэффициент (§3) |
| Светофор | Случайная пауза 0.8–2 мин с вероятностью 0.35 (`planTrip.ts:109`) | Детерминированный цикл светофора, три микро-фазы (§4) |
| Метро | Одно событие `metro-ride` на всю поездку по линии (`planTrip.ts:330`); картинка — автономный CSS-цикл 64 с (`MetroScenes.tsx:554`) | Событие на каждый перегон и каждую стоянку (§5) |
| Автобус | Одно–два события `bus-ride`; остановки — `setTimeout`-цикл `useRideCycle` (`TransportScenes.tsx:33`) | Событие на каждый сегмент, остановку и светофор (§6) |
| Часы пик | 07:30–10:00 и 17:00–20:00 (`transit.ts:408`) | 08:00–10:00 и 17:30–19:30 с плавными плечами по 30 мин (§6.2) |
| МЦК / МЦД | Нет | Фрагменты линий в `transit.ts` (§5.7) |

Что **не меняется**: алгоритм Dijkstra в `findRoute`, машина состояний `TRAVEL_STATES`, id узлов (`place:` / `gate:` / `mv:` / `mp:` / `bs:` / `bld:`), правило `events[i].to === events[i+1].from`, смысл `ScenarioEvent.duration` (игровые минуты).

---

## 1. Единицы и часы симуляции

### 1.1. Единицы
- Данные и формулы этого документа — **метры** и **секунды реального мира**.
- `ScenarioEvent.duration` и `CityEdge.minutes` остаются в **игровых минутах**: `minutes = seconds / 60`.
- Игровое время идёт быстрее реального в `timeScale` раз.

```ts
// src/types/index.ts (добавляет architect)
export type TimeMode = 'realtime' | 'x5' | 'x15' | 'x60'

// src/simulation/time/simClock.ts (новый файл)
export const TIME_SCALE: Record<TimeMode, number> = { realtime: 1, x5: 5, x15: 15, x60: 60 }

/** Сколько реальных секунд длится событие длительностью durationMin игровых минут. */
export const eventRealSeconds = (durationMin: number, scale: number): number => (durationMin * 60) / scale

/** Игровые минуты за dMs реальных миллисекунд. */
export const gameMinutes = (dMs: number, scale: number): number => (dMs / 60000) * scale
```

Проверка формулы: поездка 40 игровых минут при `scale = 1` длится 2400 с = 40 реальных минут; при `scale = 15` — 160 с; при `scale = 60` — 40 с (текущее поведение).

### 1.2. SimClock — шаг от стенных часов

```ts
export class SimClock {
  scale = 60
  private wallMs = 0
  constructor(private readonly nowMs: () => number = Date.now) {}
  start(): void { this.wallMs = this.nowMs() }
  /** Реальные миллисекунды с прошлого вызова. Никогда не отрицательно, сверху не ограничено. */
  stepMs(): number {
    const n = this.nowMs()
    const d = Math.max(0, n - this.wallMs)
    this.wallMs = n
    return d
  }
}
```

Почему `Date.now()`, а не `performance.now()`: во время сна системы `performance.now()` в Chrome может не идти, и тогда пропущенный час исчезает. Перевод системных часов назад даёт отрицательную разницу — она обнуляется `Math.max(0, …)`.

### 1.3. Продвижение симуляции и перемотка

Замена `ScenarioEngine.loop()` + `tick()`:

```ts
const CATCH_UP_GAP_MS = 2000      // разрыв длиннее — пропущенные события «бесшумные»
const MAX_CATCH_UP_EVENTS = 2000  // страховка от бесконечного цикла

private loop(): void {
  const dMs = this.clock.stepMs()
  const s = useWorldStore.getState()
  if (!s.started || s.paused) return           // пауза: время не копится, stepMs уже сбросил отсчёт
  this.advance(gameMinutes(dMs, this.clock.scale), dMs > CATCH_UP_GAP_MS)
}

/** dGame — игровые минуты «времени событий». silent — идёт перемотка после разрыва. */
private advance(dGame: number, silent: boolean): void {
  let left = dGame
  let guard = 0
  while (left > 0 && this.current && guard++ < MAX_CATCH_UP_EVENTS) {
    const remain = this.current.duration - this.elapsed
    if (left < remain) { this.elapsed += left; this.clockMin += left * (this.current.clockRate ?? 1); left = 0; break }
    left -= remain
    this.clockMin += remain * (this.current.clockRate ?? 1)
    this.nextEvent(silent && left > 0)   // событие, внутри которого перемотка закончится, применяется обычным образом
  }
  this.publishClock()                    // §1.5
}
```

Правила:
1. `this.elapsed` и `duration` — игровые минуты. `this.clockMin` — показание часов; для сна (`clockRate > 1`) часы идут быстрее событий. В режиме `realtime` `clockRate` игнорируется (равен 1), а часы после каждого шага приравниваются к `moscowNow().minutes` — игровое время и московское совпадают по построению.
2. `nextEvent(silent)` — бывший `playNext`. При `silent === true`: событие получает `silent: true`, занавес не включается (`transitionTo` не ставится), `setCaption` не вызывается, `eventBus` `'travel-sound'` не шлётся, `'travel-state'` шлётся с `silent: true`.
3. Последнее событие перемотки применяется как обычное, но стартует с ненулевого `elapsed` (герой появляется посреди перегона, а не в его начале).
4. Если очередь пуста — `routine.next(...)` вызывается внутри цикла, как сейчас в `advance()`.
5. Шаги для звука (`footstep`) считаются только когда `silent === false`.

### 1.4. Тикер

Источник тиков — выделенный воркер (таймеры воркера не привязаны к троттлингу главного потока скрытой вкладки; факт проверяется замером `scripts/bg-cpu.mjs`, а корректность от него не зависит — см. §1.3):

```ts
// src/simulation/time/ticker.worker.ts
setInterval(() => postMessage(0), 250)

// ScenarioEngine.start()
try {
  this.worker = new Worker(new URL('../time/ticker.worker.ts', import.meta.url), { type: 'module' })
  this.worker.onmessage = () => this.loop()
} catch {
  this.timer = setInterval(() => this.loop(), 250)   // запасной путь
}
document.addEventListener('visibilitychange', this.onVisible)  // visible → немедленный loop()
```
`stop()` обязан вызвать `worker.terminate()`, `clearInterval`, снять слушатель.

### 1.5. Что пишется в `worldStore` и как часто

| Поле | Когда пишется |
|---|---|
| `minutes` | Только когда изменилось `Math.floor(clockMin)` (1 раз в игровую минуту: 1 Гц при 60×, 1 раз в минуту при 1:1) |
| `dayCount` | При переходе через 1440 (в `realtime` — при смене московской даты) |
| `event`, `eventKey`, `location`, `pose`, `node`, `travelState`, `plan` | При смене события, одним `setState` |
| `eventElapsed` | **Удаляется из высокочастотной записи.** Пишется один раз при смене события (стартовое значение для карты). Прогресс читается из `eventProgress` |
| `timeMode` | По действию пользователя |

Прогресс события — модуль вне React:

```ts
// src/simulation/time/eventProgress.ts
const st = { key: 0, startMs: 0, durMs: 1, pausedAt: 0 }
export function beginEvent(key: number, durationMin: number, scale: number, elapsedMin = 0, now = Date.now()): void {
  st.key = key
  st.durMs = Math.max(1, eventRealSeconds(durationMin, scale) * 1000)
  st.startMs = now - eventRealSeconds(elapsedMin, scale) * 1000
  st.pausedAt = 0
}
export function pauseEvent(now = Date.now()): void { if (!st.pausedAt) st.pausedAt = now }
export function resumeEvent(now = Date.now()): void { if (st.pausedAt) { st.startMs += now - st.pausedAt; st.pausedAt = 0 } }
/** 0..1 */
export function getEventProgress(now = Date.now()): number {
  const t = (st.pausedAt || now) - st.startMs
  return t <= 0 ? 0 : t >= st.durMs ? 1 : t / st.durMs
}
export const getEventKey = (): number => st.key
export const getEventRealMs = (): number => st.durMs
```
При смене `timeMode` посреди события движок вызывает `beginEvent(key, duration, newScale, this.elapsed)`.

---

## 2. Граф города в метрах и секундах

### 2.1. Новые поля (`src/data/cityGraph.ts`, интерфейсы меняет architect)

```ts
export interface CityEdge {
  // существующие поля без изменений: from, to, mode, kind, minutes, km, line, availability, timeAt
  /** длина по улицам/путям, м (km * 1000; хранится явно, чтобы формулы не делили на 1000) */
  meters: number
  /** класс улицы для пеших рёбер kind === 'street' (ширина перехода, цикл светофора) */
  street?: StreetClass
}
export type StreetClass = 'lane' | 'avenue' | 'ring'
```

Правило: `minutes` каждого ребра вычисляется из `meters` функциями файла `src/simulation/travel/segments.ts` (§3–§6). Литералы минут в `buildMoscow()` остаются только там, где нет геометрии (см. §5.2).

### 2.2. Дистанции

| Ребро | `meters` |
|---|---|
| `inner` (место ↔ выход) | `PlaceDef.innerMeters` — новое поле; начальное значение `inner * 60 * 1.35`, округлить до 10 м (старое `inner` в минутах удалить после миграции) |
| `street` (улица) | `kmBetween(a, b) * 1000 * DETOUR` (`DETOUR = 1.3`, без изменений) |
| `ride` метро | `kmBetween * 1000 * 1.15` (как сейчас) |
| `ride` автобус | `kmBetween * 1000 * 1.25` (как сейчас) |
| `ride` такси | `kmBetween * 1000 * 1.35` (как сейчас) |
| `access-in` / `access-out` | `2 * 0.8 * depthM` для станций с эскалатором, иначе 60 (§5.3) |
| `transfer` | `transferSec * 1.0` (условно 1 м/с с учётом лестниц) |

### 2.3. Класс улицы
`street` пешего ребра определяется по району узла `from`: `t = LOCATIONS[nodeArea(from)].traffic`.
`t >= 0.8` → `'ring'`; `0.4 <= t < 0.8` → `'avenue'`; иначе `'lane'`.

| Класс | Ширина проезжей части `W`, м | Цикл светофора `C`, с | Зелёный пешеходам `G`, с |
|---|---|---|---|
| `lane` | 16 | 60 | 25 |
| `avenue` | 22 | 90 | 25 |
| `ring` | 27 | 120 | 30 |

---

## 3. Пеший шаг

```ts
// src/simulation/travel/segments.ts
export const WALK_MPS = 1.35                    // ≈ 4.86 км/ч
export const APPROACH_M = 12                    // участок «подходит к переходу»

export function walkSpeedFactor(w: WeatherKind, icy: boolean): number {
  let k = 1
  if (w === 'light-rain') k = 0.92
  else if (w === 'heavy-rain' || w === 'thunderstorm') k = 0.85
  else if (w === 'snow') k = 0.9
  else if (w === 'heavy-snow') k = 0.8
  else if (w === 'windy') k = 0.97
  return icy ? Math.min(k, 0.85) : k
}
/** Гололёд: мокро и около нуля, либо укатанный снег в оттепель. */
export const isIcy = (temperature: number, wetness: number, snowCover: number): boolean =>
  (temperature <= 0 && wetness >= 0.3) || (snowCover >= 0.5 && temperature >= -2 && temperature <= 1)

export const walkSeconds = (meters: number, k: number): number => meters / (WALK_MPS * k)
```

- `RouteOptions` и `TripOptions` получают поле `icy?: boolean` (движок передаёт `isIcy(s.temperature, s.wetness, s.snowCover)`).
- `walkSlowdown` из `router.ts` удаляется; его место занимает `walkSpeedFactor`. `walkWeatherPenalty` (штраф **стоимости**, не времени) остаётся.
- Пешие участки внутри метро (вестибюль, пересадка) погодой не замедляются.

Контрольные значения для тестов: 500 м в ясную погоду → 370.4 с; в ливень → 435.7 с; в сильный снег → 463.0 с.

---

## 4. Переход дороги и светофор

### 4.1. Новые фазы (`TravelPhase`, добавляет architect)
`'approaching-crosswalk'` → `'waiting-for-green-light'` → `'crossing-street'`.
Старая фаза `'walk-crossing'` остаётся в типе (совместимость), но `planTrip` её больше не создаёт.

| Фаза | `TravelState` | Поза | Звуки (`TravelSoundCue`) | `announce` | Границы длительности, игровые мин |
|---|---|---|---|---|---|
| `approaching-crosswalk` | `WALKING` | `walk` | `footsteps` | нет | [0.1, 0.3] |
| `waiting-for-green-light` | `WAITING` | `wait` | `crosswalk-signal` | да («Ждёт зелёный — 32 с») | [0.3, 0.8] |
| `crossing-street` | `WALKING` | `walk` | `crosswalk-go`, `footsteps` | нет | [0.18, 0.36] |

Новая подсказка `'crosswalk-go'` — частое «тиканье» зелёного сигнала.
Все три фазы: `location: 'area'`, `kind: 'stroll'`, `from === to === ` узел начала ребра (переход происходит «на ребре», узел не меняется; непрерывность цепочки сохраняется).

### 4.2. Сколько переходов на ребре

```ts
export const crossingsOn = (meters: number): number => Math.max(0, Math.min(4, Math.round(meters / 350)))
```
175 м и короче — 0 переходов; 350 м — 1; 700 м — 2; свыше 1225 м — 4.

### 4.3. Модель светофора (детерминированная)

```ts
// src/simulation/travel/crosswalk.ts
export interface SignalTiming { cycleSec: number; greenSec: number; waitSec: number; crossSec: number }

const STREET: Record<StreetClass, { w: number; c: number; g: number }> = {
  lane: { w: 16, c: 60, g: 25 }, avenue: { w: 22, c: 90, g: 25 }, ring: { w: 27, c: 120, g: 30 },
}
const MIN_START_GREEN = 5   // начинать переход, только если зелёного осталось ≥ 5 с

/** FNV-1a 32 бита — тот же приём, что waitFactor в router.ts */
export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h >>> 0
}

/**
 * crossingId = `${edge.from}>${edge.to}#${k}`; tSec — игровое время прихода к бордюру, секунды от полуночи.
 * Зелёное окно пешеходам: фаза p ∈ [0, G).
 */
export function signalAt(crossingId: string, street: StreetClass, tSec: number, k: number): SignalTiming {
  const { w, c, g } = STREET[street]
  const offset = hash32(crossingId) % c
  const p = (((tSec + offset) % c) + c) % c
  const canGo = p < g - MIN_START_GREEN
  const raw = canGo ? 0 : c - p
  const waitSec = canGo ? 0 : Math.min(45, Math.max(20, raw))
  const crossSec = Math.min(20, Math.max(12, w / (WALK_MPS * k)))
  return { cycleSec: c, greenSec: g, waitSec, crossSec }
}
```
Зажим ожидания в [20, 45] с — требование продукта (красный короче 20 с герой «не перебегает», длиннее 45 с — не показываем). Вероятность попасть на красный: `lane` 0.67, `avenue` 0.78, `ring` 0.79.

### 4.4. Разбиение уличного ребра

Единая чистая функция, которой пользуются **и** роутер (время ребра), **и** `planTrip` (события) — поэтому сумма фаз равна времени маршрута:

```ts
export interface StreetPart { phase: 'walk-street' | 'approaching-crosswalk' | 'waiting-for-green-light' | 'crossing-street'; sec: number; meters: number; signal?: SignalTiming }

export function streetParts(edge: CityEdge, tStartSec: number, k: number): StreetPart[] {
  const n = crossingsOn(edge.meters)
  const street = edge.street ?? 'lane'
  const w = STREET[street].w
  const walkM = Math.max(20 * (n + 1), edge.meters - n * (APPROACH_M + w))   // остаток на обычную ходьбу
  const seg = walkM / (n + 1)
  const parts: StreetPart[] = []
  let t = tStartSec
  for (let i = 0; i < n; i++) {
    const a = walkSeconds(seg, k);            parts.push({ phase: 'walk-street', sec: a, meters: seg });                 t += a
    const b = walkSeconds(APPROACH_M, k);     parts.push({ phase: 'approaching-crosswalk', sec: b, meters: APPROACH_M }); t += b
    const sig = signalAt(`${edge.from}>${edge.to}#${i}`, street, t, k)
    if (sig.waitSec > 0) {                    parts.push({ phase: 'waiting-for-green-light', sec: sig.waitSec, meters: 0, signal: sig }); t += sig.waitSec }
    parts.push({ phase: 'crossing-street', sec: sig.crossSec, meters: w, signal: sig });                                  t += sig.crossSec
  }
  parts.push({ phase: 'walk-street', sec: walkSeconds(seg, k), meters: seg })
  return parts
}
export const streetSeconds = (edge: CityEdge, tStartSec: number, k: number): number =>
  streetParts(edge, tStartSec, k).reduce((a, p) => a + p.sec, 0)
```

Подключение:
- `buildMoscow()`: у каждого ребра `kind === 'street'` задать `timeAt = (m) => streetSeconds(edge, m * 60, 1) / 60`. Погодный коэффициент роутер применяет сам: в `findRoute` вместо `minutes *= slow` вызвать `streetSeconds(e, t * 60, k) / 60`, где `k = walkSpeedFactor(opts.weather, !!opts.icy)`.
- `routeToEvents()`: для уличного шага вызвать `streetParts(...)` с тем же `t` и `k` и выдать по событию на часть. Первая и последняя части `walk-street` сохраняют существующую логику подписи и фазы (`metro-approach`, «Идёт к остановке…»). Слияние соседних уличных шагов одного района (`planTrip.ts:138–148`) сохраняется для частей `walk-street`, стоящих встык.
- Необязательная остановка `walk-window` (витрина) остаётся как есть и по-прежнему считается «extras».
- Событие получает новые необязательные поля (добавляет architect в `ScenarioEventTravelFields`):

```ts
/** длина участка, м */
meters?: number
/** параметры светофора для фаз перехода (визуальный таймер и звук) */
signal?: { cycleSec: number; greenSec: number; waitSec: number; crossSec: number }
```

### 4.5. Визуальный таймер
Сцена показывает обратный отсчёт на пешеходном светофоре (`StreetKit.tsx`): число = `Math.ceil(signal.waitSec * (1 - progress))`, где `progress = getEventProgress()`. Обновление — раз в секунду через `animationClock`, запись в `textContent` по ref, без `setState`. При `eventRealSeconds < 2` (режим 60×) таймер не показывается: светофор просто красный, затем зелёный.

---

## 5. Метро

### 5.1. Фазы поездки и хронометраж

| № | Фаза (`TravelPhase`) | Секунды реального мира | Формула / источник |
|---|---|---|---|
| 1 | `metro-vestibule` | 30–40 | `30 + h01(station + ':v') * 10` |
| 2 | `metro-turnstile` | 15–20 | `15 + h01(station + ':t') * 5` (сумма 1+2 = 45–60) |
| 3 | `metro-escalator-down` | 45 … 170 | `escalatorSec(depthM)` (§5.3) |
| 4 | `metro-platform-wait` | 0.25–1.0 интервала | `metroHeadwaySec(t) * waitFactor(...)` (§5.4) |
| 5 | `metro-train-arrival` | 20 | поезд выходит из тоннеля, тормозит, открывает двери |
| 6 | `metro-boarding` | 10 | выход пассажиров, посадка героя |
| 7 | `metro-departure` | 15 | двери закрываются, разгон |
| 8 | `metro-ride` | 80–130 | `runSec(meters) - 30` (§5.5) |
| 9 | `metro-arriving` | 15 | торможение, объявление станции |
| 10 | `metro-dwell` (**новая**) | 20–25 | стоянка на промежуточной станции (§5.5) |
| … | повтор 7 → 8 → 9 (→ 10) для каждого следующего перегона | | |
| 11 | `metro-alighting` | 15 | выход из вагона на конечной для героя станции |
| 12 | `metro-transfer` | 180–240 (кросс-платформенная 45) | §5.6 |
| 13 | `metro-escalator-up` | 45 … 170 | `escalatorSec(depthM)` |
| 14 | `metro-exit` | 30–45 | `30 + h01(station + ':x') * 15` |

`h01(s) = hash32(s) / 4294967296` — детерминированное число [0, 1).

Новая фаза в `PHASES` (`states.ts`):
```ts
'metro-dwell': P('RIDING_METRO', 'metro-ride', 'metro-ride', ['sit', 'stand', 'phone', 'read'], [0.3, 0.45], ['doors-open', 'doors-close']),
```
Обновить границы длительностей в `PHASES` (игровые минуты): `metro-vestibule` [0.45, 0.7] · `metro-turnstile` [0.2, 0.4] · `metro-escalator-down/up` [0.7, 2.9] · `metro-train-arrival` [0.3, 0.4] · `metro-boarding` [0.15, 0.2] · `metro-departure` [0.2, 0.3] · `metro-ride` [1.3, 2.2] · `metro-arriving` [0.2, 0.3] · `metro-alighting` [0.2, 0.3] · `metro-transfer` [0.7, 4.1] · `metro-exit` [0.45, 0.8] · `metro-platform-wait` [0.2, 50] (без изменений: ожидание открытия метро утром).

### 5.2. Изменения данных станции (`transit.ts`)

```ts
export interface MetroStationDef {
  id: string; line: string; name: string; lat: number; lng: number
  /** глубина заложения, м (приблизительно) */
  depthM: number
  /** @deprecated вычисляется: escalatorSec(depthM) / 60. Удалить после миграции cityGraph.ts */
  escalator: number
}
```

### 5.3. Эскалатор

Модель: наклон 30°, скорость ленты 0.75 м/с, высота подъёма ≈ 0.8 от глубины заложения. Длина ленты = `2 * 0.8 * depthM`, время = длина / 0.75 = `2.13 * depthM`.

```ts
export const SHALLOW_M = 12
export function escalatorSec(depthM: number): number {
  if (depthM <= SHALLOW_M) return 45                              // мелкое заложение: лестница/короткий эскалатор
  return Math.min(170, Math.max(60, Math.round(2.13 * depthM)))
}
```
Контроль: 8 м → 45 с; 33 м → 70 с; 50 м → 107 с; 62 м → 132 с; 73 м → 155 с.

Глубины (`depthM`). **Значения приблизительные, записаны по памяти из открытых источников и могут расходиться с фактическими на несколько метров. Исполнитель обязан сверить каждое с открытым источником и исправить; тест проверяет только диапазон 5–90 м и результат `escalatorSec`.**

| id | м | id | м | id | м |
|---|---|---|---|---|---|
| 1-lubyanka | 32 | 3-arbatskaya | 41 | 6-vdnh | 53 |
| 1-okhotny | 15 | 3-pl-revolyutsii | 34 | 6-alekseevskaya | 51 |
| 1-biblioteka | 12 | 3-kurskaya | 31 | 6-rizhskaya | 46 |
| 1-kropotkinskaya | 13 | 4-aleksandrovsky | 7 | 6-prospekt-mira | 50 |
| 1-park-kultury | 10 | 4-arbatskaya | 8 | 6-sukharevskaya | 43 |
| 1-frunzenskaya | 42 | 4-smolenskaya | 8 | 6-turgenevskaya | 49 |
| 1-sportivnaya | 42 | 4-kievskaya | 9 | 6-kitay-gorod | 29 |
| 2-belorusskaya | 34 | 4a-kievskaya | 9 | 6-tretyakovskaya | 46 |
| 2-mayakovskaya | 33 | 4a-vystavochnaya | 25 | 6-oktyabrskaya | 50 |
| 2-tverskaya | 42 | 4a-mezhdunarodnaya | 25 | 6-shabolovskaya | 46 |
| 2-teatralnaya | 35 | 5-park-kultury | 40 | 7-barrikadnaya | 30 |
| 2-novokuznetskaya | 37 | 5-oktyabrskaya | 40 | 7-pushkinskaya | 51 |
| 2-paveletskaya | 33 | 5-dobryninskaya | 35 | 7-kuznetsky-most | 39 |
| 3-park-pobedy | 73 | 5-paveletskaya | 40 | 7-kitay-gorod | 29 |
| 3-kievskaya | 38 | 5-taganskaya | 53 | 7-taganskaya | 36 |
| 3-smolenskaya | 50 | 5-kurskaya | 40 | 8a-delovoy | 30 |
| 9-chekhovskaya | 62 | 5-komsomolskaya | 37 | 8a-park-pobedy | 73 |
| 9-borovitskaya | 46 | 5-prospekt-mira | 40 | 5-krasnopresnenskaya | 35 |
| 9-polyanka | 36 | 5-novoslobodskaya | 40 | 5-kievskaya | 53 |
| 9-serpukhovskaya | 43 | 5-belorusskaya | 42 | | |

Рёбра доступа в `buildMoscow()`:
`access-in.minutes = (vestibuleSec + turnstileSec + escalatorSec(depthM)) / 60`;
`access-out.minutes = (escalatorSec(depthM) + exitSec) / 60`.

### 5.4. Интервал движения

```ts
/** Интервал поездов, секунды. h — час суток 0..24. */
export function metroHeadwaySec(minutes: number): number {
  const h = (((minutes / 60) % 24) + 24) % 24
  if (peakWeight(minutes) >= 0.5) return 90
  if (h >= 6 && h < 21) return 120
  if (h >= 21 && h < 23) return 150
  if (h >= 23 || h < 1) return 300
  return 360                      // 05:30–06:00
}
```
`metroHeadway(minutes)` (минуты) остаётся для роутера: `metroHeadwaySec(minutes) / 60`. Ожидание героя = `headwaySec * waitFactor(seed, line, t)` — функция `waitFactor` из `router.ts` без изменений (доля 0.25–1.0).

### 5.5. Постанционный проезд

Поезд не телепортируется: каждый перегон и каждая промежуточная станция — отдельные события.

```ts
/** Время перегона «двери закрылись → двери открылись», с. Линейная модель, откалибрована на 110–160 с. */
export const runSec = (meters: number): number => Math.min(160, Math.max(110, Math.round(70 + meters * 0.045)))
export const ACCEL_SEC = 15
export const BRAKE_SEC = 15
/** Стоянка на промежуточной станции, с: в час пик 25, иначе 20–24. */
export const dwellSec = (stationId: string, minutes: number): number =>
  peakWeight(minutes) >= 0.5 ? 25 : 20 + Math.floor(h01(stationId + ':d') * 5)
```
Контроль: 800 м → 110 с (нижний предел); 1500 м → 138 с; 2000 м → 160 с.

Ребро `ride` метро: `minutes = runSec(meters) / 60`. Стоянка **не входит** в ребро: роутер добавляет её при проезде станции без пересадки. В `findRoute`, в ветке `ride && !boarding` (продолжение той же линии), к `t` и `cost` прибавить `dwellSec(stationIdOf(e.from), t) / 60`. В `RouteStep` добавить поле `dwell: number` (минуты; 0 для первого перегона и не-метро).

Генерация событий в `routeToEvents()` для отрезка одной линии из перегонов `ride[0..N-1]` (заменяет блок `planTrip.ts:317–350`):

```
platform-wait (wait) → train-arrival (20 с) → boarding (10 с)
для i = 0..N-1:
  [i > 0] metro-dwell      from=to=ride[i].from     station = имя(ride[i].from), nextStation = имя(ride[i].to)   dwellSec
  metro-departure          from=to=ride[i].from     station = имя(from),         nextStation = имя(to)           15 с
  metro-ride               from=ride[i].from → to=ride[i].to                                                      runSec − 30
  metro-arriving           from=to=ride[i].to       station = имя(to)                                             15 с
metro-alighting (15 с) — создаётся существующей веткой `s.alight > 0` следующего шага
```
`boardOverhead` метро = 30 с (0.5 мин), `alightOverhead` = 15 с (0.25 мин) — заменить значения `OVERHEAD.metro` в `cityGraph.ts` с `[1, 1]` на `[0.5, 0.25]`.

Каждое событие перегона получает поле (добавляет architect):
```ts
/** номер перегона в поездке по линии и их общее число (для табло «3 / 7») */
hop?: { index: number; count: number }
```

Подписи: `metro-departure` — «Осторожно, двери закрываются. Следующая станция — «{nextStation}»»; `metro-arriving` — «Станция «{station}»»; `metro-dwell` — «Стоянка: «{station}»». `announce`: только первый `metro-ride` поездки по линии и `metro-arriving` последнего перегона (иначе тосты идут сплошным потоком).

### 5.6. Пересадки

```ts
export interface TransferDef { a: string; b: string; /** секунды пешего перехода */ sec: number; crossPlatform?: boolean }
export const transferSec = (oldMinutes: number, crossPlatform = false): number =>
  crossPlatform ? 45 : Math.min(240, Math.max(180, oldMinutes * 60))
```
Миграция `METRO_TRANSFERS`: поле `minutes` заменить на `sec = transferSec(minutes, crossPlatform)`. Кросс-платформенная пересадка в текущих данных одна: `6-kitay-gorod ↔ 7-kitay-gorod` (`crossPlatform: true`, 45 с). Остальные: записи с 2–3 мин → 180 с, с 4 мин → 240 с.

### 5.7. МЦК и МЦД (расширение данных)

`MetroLineDef` получает поле `kind?: 'metro' | 'mcc' | 'mcd'` (по умолчанию `'metro'`). `TravelMode` не расширяется: это `mode: 'metro'`, отличия — в параметрах и в сцене (наземная платформа, вид на город за окном).

| Параметр | метро | МЦК (`mcc`) | МЦД (`mcd`) |
|---|---|---|---|
| Перегон, с | `clamp(70 + 0.045 m, 110, 160)` | `clamp(60 + 0.05 m, 120, 300)` | `clamp(60 + 0.05 m, 120, 300)` |
| Стоянка, с | 20–25 | 30–40 | 30–40 |
| Интервал, с | 90 / 120 / 150 / 300 | пик 240, день 360, вечер 480 | пик 300, день 480, вечер 600 |
| Вход на платформу | вестибюль + турникет + эскалатор | турникет 15–20 + мост/лестница 90 | то же |
| Часы работы | 05:30–01:00 | 05:30–01:00 | 05:30–01:00 |

Минимальный набор для связности с текущим графом (названия реальные; координаты исполнитель берёт из открытого источника и помечает приблизительными):
- **МЦК (линия 14), фрагмент:** Деловой центр (МЦК) — Кутузовская — Лужники — Площадь Гагарина. Пересадки: Деловой центр (МЦК) ↔ `4a-mezhdunarodnaya`; Лужники ↔ `1-sportivnaya`.
- **МЦД-1, фрагмент:** Белорусская — Беговая — Тестовская. Пересадки: Белорусская (МЦД) ↔ `2-belorusskaya`, `5-belorusskaya`; Тестовская ↔ `4a-mezhdunarodnaya`.
- **МЦД-2, фрагмент:** Рижская — Площадь трёх вокзалов — Курская. Пересадки: Рижская (МЦД) ↔ `6-rizhskaya`; Площадь трёх вокзалов ↔ `5-komsomolskaya`; Курская (МЦД) ↔ `3-kurskaya`, `5-kurskaya`.

Пересадки метро ↔ МЦК/МЦД — уличные, 240 с. Задача выполняется отдельным шагом после §5.1–§5.6 и не блокирует их.

---

## 6. Наземный транспорт

### 6.1. Фазы

| Фаза | Секунды | Формула |
|---|---|---|
| `bus-stop-wait` | 0.25–1.0 интервала | `busHeadway` (7 / 10 / 15 / 25 мин — без изменений) |
| `bus-arrival` | 25 | подъезжает, открывает двери |
| `bus-boarding` | 10 | |
| `bus-validate` | 6 | |
| `bus-ride` (сегмент между остановками или светофорами) | `meters / (v * c)` | §6.2 |
| `bus-traffic-light` | 15–45, в пик × 1.3 | §6.3 |
| `bus-stop-dwell` (**новая**) | 20–30 | `peakWeight >= 0.5 ? 30 : 20 + floor(h01(stopId + ':d') * 8)` |
| `bus-alighting` | 12 | |

```ts
'bus-stop-dwell': P('RIDING_BUS', 'bus-ride', 'bus-ride', ['sit', 'stand', 'phone'], [0.3, 0.55], ['bus-brake', 'bus-doors']),
```
`OVERHEAD.bus` и `OVERHEAD.tram`: `[41 / 60, 0.2]` (25 + 10 + 6 с посадка; 12 с выход). `BUS_DWELL` из ребра убирается: стоянка — отдельное событие, роутер добавляет её так же, как `dwell` метро (§5.5).

### 6.2. Скорость и пробки

```ts
// src/simulation/travel/congestion.ts
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }
/** 0..1: 1 внутри 08:00–10:00 и 17:30–19:30, плавные плечи по 30 мин снаружи. */
export function peakWeight(minutes: number): number {
  const h = (((minutes / 60) % 24) + 24) % 24
  const win = (a: number, b: number) => Math.min(smooth((h - (a - 0.5)) / 0.5), smooth((b + 0.5 - h) / 0.5))
  return Math.max(0, win(8, 10), win(17.5, 19.5))
}
/** Множитель скорости 0.45..1 для транспорта в общем потоке. */
export const congestion = (minutes: number): number => 1 - 0.55 * peakWeight(minutes)

export const BUS_FREE_MPS = 6.9      // ≈ 25 км/ч между остановками без пробок
export const BUS_NIGHT_MPS = 8.9     // ≈ 32 км/ч
export const TRAM_FREE_MPS = 5.6     // ≈ 20 км/ч, обособленные пути
export const TAXI_FREE_MPS = 9.7     // ≈ 35 км/ч

export function vehicleSeconds(meters: number, mode: 'bus' | 'tram' | 'taxi', minutes: number, night: boolean): number {
  const v = mode === 'tram' ? TRAM_FREE_MPS : mode === 'taxi' ? TAXI_FREE_MPS : night ? BUS_NIGHT_MPS : BUS_FREE_MPS
  const c = mode === 'tram' ? Math.max(0.8, congestion(minutes)) : congestion(minutes)
  return meters / (v * c)
}
```
Контроль: `peakWeight(9:00) = 1`, `peakWeight(7:30) = 0`, `peakWeight(7:45) = 0.5`, `peakWeight(13:00) = 0`. Автобус, 1000 м: днём 145 с, в 09:00 — 322 с.

`isPeak` в `transit.ts` заменить на `peakWeight(minutes) >= 0.5` (используют `metroHeadway`, `busHeadway`, `taxiWait`). `taxiKmh` заменить на `vehicleSeconds(..., 'taxi', ...)`.

### 6.3. Светофоры на пути транспорта

Число светофоров на сегменте: `lights = Math.min(3, Math.floor(meters / 450))`. Для светофора `j` сегмента: `id = ${edge.from}>${edge.to}@${j}`; красный, если `h01(id + ':' + Math.floor(tSec / 90)) < 0.5` (исход меняется каждые 90 с игрового времени, поэтому одна и та же поездка в разное время выглядит по-разному, но воспроизводима); стоянка `(15 + h01(id + ':w') * 30) * (1 + 0.3 * peakWeight)` секунд.

Функция `rideParts(edge, tStartSec, mode, night)` возвращает массив `{ phase: 'bus-ride' | 'bus-traffic-light'; sec; meters }` — аналог `streetParts`; ею пользуются и `timeAt` ребра, и `routeToEvents`. Для такси фазы `taxi-ride` и остановка на светофоре остаётся внутри события `taxi-ride` (в сцене такси — стоп-сигналы впереди; отдельная фаза не нужна), но время светофоров в длительность входит.

### 6.4. Генерация событий автобуса
```
bus-stop-wait → bus-arrival → bus-boarding → bus-validate
для каждого сегмента i = 0..N-1:
  [i > 0] bus-stop-dwell     from=to=stop[i]     station = имя(stop[i]), nextStation = имя(stop[i+1])
  rideParts(...) → чередование bus-ride / bus-traffic-light, from=stop[i] → to=stop[i+1] у последней части bus-ride
bus-alighting
```
Промежуточные части `bus-ride` одного сегмента: `from === to === stop[i]` у всех частей, кроме последней (у неё `from = stop[i]`, `to = stop[i+1]`) — узел меняется один раз на сегмент, непрерывность сохраняется. Случайная вставка светофора (`planTrip.ts:443`, вероятность 0.55) удаляется.

---

## 7. Звук фаз (контракт для `audio-engineer`)

1. `travelInput(ev)` в `AudioLifecycleManager.ts` передаёт `duration: eventRealSeconds(ev.duration, TIME_SCALE[timeMode])` — реальные секунды. Комментарий в `TravelSoundInput.duration` уже говорит «реальные секунды»; сейчас это верно только при 60×.
2. Событие с `silent: true` → `travel.onPhase({ ...input, sounds: [], silent: true })`: модель встаёт в целевые `speed`/`presence` за 0.5 с, без одноразовых звуков.
3. Порог подсказок: одноразовые звуки (`doors-open`, `station-announcement`, `turnstile`, `validator-beep`, `crosswalk-go` …) играются, только если реальная длительность фазы ≥ `MIN_CUE_REAL_SEC = 2`. Непрерывные слои (гул тоннеля, двигатель) работают всегда.
4. Соответствие новых фаз:

| Фаза | Модель поезда/машины | Одноразовые звуки |
|---|---|---|
| `metro-departure` | `targetSpeed = 1` | двухтональный сигнал + шипение дверей (`doors-close`) |
| `metro-ride` | `targetSpeed = 1`, стук колёс по скорости | — |
| `metro-arriving` | `targetSpeed = 0`, скрип тормозов | трёхтональный сигнал (`station-announcement`) |
| `metro-dwell` | `targetSpeed = 0`, `presence = 1`, акустика `car-station` | `doors-open` в начале; `doors-close` за 3 с до конца фазы |
| `bus-stop-dwell` | `targetSpeed = 0` | `bus-brake` в начале, `bus-doors` через 1.5 с и за 3 с до конца |
| `waiting-for-green-light` | — | редкое «тук» раз в 1 с (`crosswalk-signal`) на всю фазу |
| `crossing-street` | — | частое «тик» 5 Гц (`crosswalk-go`) на всю фазу + шаги |

5. Ускорения модели поезда (`mover(0.18, 0.26, …)`) подобраны под 60×. Новое правило: `accel = 1 / ACCEL_REAL`, `decel = 1 / BRAKE_REAL`, где `ACCEL_REAL = BRAKE_REAL = min(15, реальная длительность фазы departure/arriving)` секунд — поезд достигает полной скорости ровно к концу фазы разгона при любом масштабе.
6. Акустическое пространство по фазе — таблица в `BUGFIX_AND_OPTIMIZATION_AUDIT.md` §4.4.

---

## 8. Режимы времени для пользователя

### 8.1. Режимы

| Режим (`timeMode`) | Масштаб | Часы на экране | Для кого |
|---|---|---|---|
| `realtime` — «Real-Time 1:1» | 1 | Настоящее московское время (`moscowNow`) | Фоновая музыка, Pomodoro: поездка ВДНХ → Хамовники занимает реальные 35–45 минут |
| `x5` — «Ускоренно 5×» | 5 | Игровые, от старта сценария | Наблюдать поездку целиком за 7–9 минут |
| `x15` — «Ускоренно 15×» | 15 | Игровые | Смена локаций каждые 1–3 минуты |
| `x60` — «Обзор 60×» | 60 | Игровые | Прежнее поведение; на нём работают существующие e2e и скриншоты |

Правила:
- Поле `worldStore.timeMode: TimeMode`. Значение по умолчанию при первом запуске — `'realtime'`; сохраняется в `localStorage['ml.timeMode']`; параметр адреса `?time=x60` имеет приоритет (его используют `playwright.config.ts` и `scripts/*.mjs`, чтобы тесты не ждали реальные минуты).
- `clockMode` (`'accelerated' | 'real'`) становится производным и помечается `@deprecated`: `clockMode === 'real'` ⇔ `timeMode === 'realtime'`. Переключатель «Реальное время суток» в `Panels.tsx` заменяется группой из четырёх кнопок.
- Смена режима не сбрасывает сценарий: `clock.scale = TIME_SCALE[mode]`, затем `beginEvent(key, duration, scale, elapsed)`. При переходе в `realtime` часы приравниваются к московским, а очередь событий после текущего перепланируется (`routine.next` от нового времени) — иначе расписание транспорта рассчитано на другое время суток.
- Сон (`clockRate > 1`) действует только при масштабе > 1. В `realtime` герой спит по настоящим часам.
- Детализация по масштабу. Цепочка событий одинакова во всех режимах; различается только показ: фаза короче 2 реальных секунд не получает одноразовых звуков (§7.3), анимации дверей и занавеса; фаза короче 0.5 с не меняет позу героя. Константы: `MIN_CUE_REAL_SEC = 2`, `MIN_POSE_REAL_SEC = 0.5` в `simClock.ts`.

### 8.2. Instant Camera Peek — «Заглянуть»

Назначение: посмотреть любую локацию, не трогая маршрут героя.

```ts
// src/stores/mapStore.ts (добавляет architect)
/** локация, в которую «заглянула» камера; null — камера с героем */
peek: LocationId | null
setPeek: (loc: LocationId | null) => void
```
- `SceneStage.tsx`: `viewLocation = peek ?? location`. Сцена строится для `viewLocation`; `data-location` = `viewLocation`; новый атрибут `data-peek="1"`.
- `Hero.tsx`: если `peek !== null && peek !== location` — возвращает `null`. `EntityLayer` и погода работают как обычно.
- `ScenarioEngine` о `peek` не знает. Симуляция, план, звуки поездки продолжаются.
- Звук: окружение (`city.setAmbience`) следует за `viewLocation`; шина звуков поездки (`TravelSoundEngine.out`) уходит в 0 за 0.6 с на время peek и возвращается за 0.6 с. Музыка не меняется.
- UI (`frontend`): в `LocationCard` у каждой выбираемой локации кнопка «Заглянуть» (`data-testid="map-peek"`); в сцене при активном peek — плашка «Вы заглянули: {место} · герой: {подпись события}» с кнопкой «Вернуться к герою» (`data-testid="peek-return"`); Esc возвращает. Когда герой начинает занятие (`phase === 'activity'`), показывается тост «Герой на месте: {локация}».
- Помещения (кофейня, офис) для peek используют уличную привязку `placeFor(loc)` как `anchor`.
- Переход в peek и обратно — «наезд» камеры (существующий `endDive` / `.scene-arrive`, после Фазы 5 — Camera Dive).

---

## 9. Контракт для сцен (`graphics-engineer`)

1. Источник истины о текущей станции — `worldStore.event.station` / `nextStation` / `hop`. Локальные таблицы линий в `MetroScenes.tsx` (`LINE_DEFS`) заменяются данными `METRO_LINES` из `transit.ts`.
2. Автономные циклы удаляются: CSS-цикл вагона 64 с (`--cyc-delay`, keyframes `station-pan`, `door-l`, `door-r`, `tunnel-o`, `disp-next`, `disp-here`) и `useRideCycle`. Вместо них корневой элемент сцены получает `data-ride` из фазы события:

| Фаза | `data-ride` | Что на экране |
|---|---|---|
| `metro-departure` / `bus-ride` после остановки | `accel` | платформа/остановка уезжает, скорость панорамы 0 → 1 за время фазы |
| `metro-ride` / `bus-ride` / `taxi-ride` | `cruise` | тоннель / город на полной скорости |
| `metro-arriving` / `bus-traffic-light` (начало) | `brake` | скорость 1 → 0, в метро появляется платформа |
| `metro-dwell` / `bus-stop-dwell` / `metro-boarding` / `bus-boarding` | `dwell` | стоим, двери открыты; NPC выходят и входят |
| `bus-traffic-light` | `stop` | стоим, двери закрыты, красный отсвет |

3. Скорость панорамы — не CSS-анимация с фиксированной длительностью, а смещение, интегрируемое в `animationClock` из профиля скорости фазы (`TRANSITION_TO_3D_AND_KINEMATICS.md` §3.5); положение восстанавливается из `getEventProgress()` после возврата из фона.
4. Длительность любой анимации героя, привязанной к событию, = `getEventRealMs()`; стартовое смещение = `getEventProgress() * getEventRealMs()`.
5. Табло вагона: «Следующая: {nextStation}» в фазах `accel`/`cruise`, «{station}» в `brake`/`dwell`; счётчик «{hop.index + 1} / {hop.count}».
6. Пешеходный светофор: красный в `waiting-for-green-light`, зелёный с таймером `signal.crossSec` в `crossing-street`; герой в `approaching-crosswalk` идёт к бордюру (x → x зебры), в `crossing-street` движется по глубине (по y от ближнего тротуара к дальнему или наоборот) с уменьшением масштаба.

---

## 10. Тесты и приёмка

Новые тесты (`src/simulation/__tests__`):

| Файл | Проверяет |
|---|---|
| `simClock.test.ts` | `gameMinutes`, `eventRealSeconds`; разрыв 3 ч → состояние равно непрерывному прогону ± 1 событие; отрицательная разница часов → 0; ≤ 2000 событий и ≤ 50 мс на перемотку 8 ч |
| `segments.test.ts` | контрольные значения §3, §5.3, §5.5, §6.2; `walkSpeedFactor` для всех 10 погод |
| `crosswalk.test.ts` | `signalAt` детерминирован; `waitSec ∈ {0} ∪ [20, 45]`; `crossSec ∈ [12, 20]`; `streetSeconds === Σ streetParts` |
| `metroHops.test.ts` | для каждой пары мест: число `metro-ride` = числу перегонов; `station`/`nextStation` — соседи в `METRO_LINES`; `metro-dwell` только между перегонами одной линии |
| `timing.test.ts` | каждое событие каждой цепочки (7 суток × 6 режимов) укладывается в диапазоны §4–§6; сумма фаз = `route.minutes` ± 0.05 |
| `realtimeTrip.test.ts` | `place:vdnh → place:khamovniki` в 12:00, ясно: 30–50 игровых минут; в 08:30 автобусом дольше, чем в 13:00 |
| существующие `chain.test.ts`, `travel.test.ts`, `engine.test.ts` | остаются зелёными (границы `PHASES` обновлены) |

E2E (`e2e/realtime.spec.ts`, владелец `qa-engineer`): при `?time=x15` за поездку на метро атрибут `data-ride` проходит последовательность `accel → cruise → brake → dwell` столько раз, сколько перегонов в `worldStore.plan`; имя станции на табло совпадает с `event.station`; переключение `timeMode` посреди события не сбрасывает прогресс; `peek` не меняет `worldStore.node`.

Критерии готовности раздела — в `MASTER_EXECUTION_ROADMAP.md`, Фаза 2.

---

## 11. Порядок работ для исполнителя (шаги ≤ 3 файлов)

1. **architect:** типы — `TimeMode`, новые `TravelPhase` (`approaching-crosswalk`, `waiting-for-green-light`, `crossing-street`, `metro-dwell`, `bus-stop-dwell`), `TravelSoundCue` `'crosswalk-go'`, поля события `meters`, `signal`, `hop`, `silent`; `CityEdge.meters`, `street`; `worldStore.timeMode`; `mapStore.peek`. `npm run typecheck`.
2. `simClock.ts` + `eventProgress.ts` + тест. Движок пока не трогать.
3. `ScenarioEngine.ts`: §1.3–§1.5 (шаг от часов, `advance`, `silent`, запись `minutes` по целой минуте). Тест разрыва таймера. Существующие тесты зелёные при `scale = 60`.
4. `segments.ts`, `congestion.ts`, `crosswalk.ts` + тесты контрольных значений.
5. `transit.ts`: `depthM`, `sec` пересадок, `innerMeters`, `metroHeadwaySec`, `peakWeight` вместо `isPeak`.
6. `cityGraph.ts`: `meters`, `street`, времена рёбер из формул, `OVERHEAD`.
7. `states.ts`: новые фазы и границы; `validateChain.ts`: новые фазы в проверках узлов.
8. `router.ts`: `walkSpeedFactor`, `streetSeconds`, `dwell` в `RouteStep`.
9. `planTrip.ts`: уличные части (§4.4), перегоны метро (§5.5), сегменты автобуса (§6.4).
10. `ticker.worker.ts` и подключение в `ScenarioEngine.start/stop`.
11. Передача контракта: `audio-engineer` (§7), `graphics-engineer` (§9), `frontend` (§8).
12. МЦК/МЦД (§5.7) — после приёмки шагов 1–11.

После каждого шага: `npx vitest run src/simulation src/data` и `npm run typecheck`. После шагов 3, 9, 10: `npm run verify` и `npx playwright test e2e/app.spec.ts e2e/map.spec.ts`.
