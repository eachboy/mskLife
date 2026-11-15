---
name: long-session-stability
description: Long-running session stability for MOSCOW LIFE, an app people leave playing for hours — memory leaks, growing DOM/node counts, timers, AudioContext lifecycle, background tabs, page freeze/resume, tab discarding, sleep/wake, CPU creep. Use this skill when the user mentions "через час тормозит", memory growth, the music stops after switching tabs, the app breaks after the laptop sleeps, or before shipping any change that adds intervals, listeners, Tone nodes, canvas loops or spawned entities.
---

# Long Session Stability

Сценарий использования MOSCOW LIFE — «включил и забыл» на 2–8 часов. Утечка в 1 МБ/мин незаметна в тестах и убивает вкладку к вечеру.

## Типичные источники проблем в проекте
- **Спавн сущностей** (`features/city/EntityLayer.tsx`): spawn → `animationend` → remove. Если `animationend` не пришёл (вкладка скрыта, `display:none`, reduced motion) — узлы копятся. Нужен страховочный таймаут удаления и верхний лимит количества.
- **Canvas погоды** (`WeatherRenderer.tsx`): rAF-цикл должен останавливаться при `document.hidden` и в unmount; массивы частиц — фиксированного размера (пул), без бесконечного push.
- **Tone-ноды**: каждый `new` ↔ `dispose()`; не создавать ноды в `tick`.
- **Подписки**: `eventBus`, zustand `subscribe`, `addEventListener` — каждая с отпиской в cleanup.
- **Интервалы**: `setInterval` в сторах/ScenarioEngine — один экземпляр, clear при остановке; не множить при HMR/повторном ENTER.

## Жизненный цикл браузера
- `visibilitychange` hidden → `mixer.suspend()`; visible → `resume()`. Пока вкладка скрыта, Chrome троттлит таймеры до 1/мин и может **заморозить** страницу (`freeze`/`resume` события Page Lifecycle) или выгрузить её (`document.wasDiscarded`).
- После возврата: игровое время не должно «догонять» часы прыжком сотен событий — ограничь шаг (clamp delta) и пересоздай план от текущего момента.
- AudioContext может оказаться в `suspended`/`interrupted` (Safari, Bluetooth-наушники) — `resume()` по следующему жесту пользователя, с понятной подсказкой в UI.
- **Не** используй Service Worker/скрытое видео/тихий осциллятор как хак для удержания вкладки живой — это против политики браузеров и разряжает батарею.

## Как измерять
1. Chrome DevTools MCP: `take_heapsnapshot` в t=0, после 10 и 30 мин ускоренного времени; сравнить retained size и число detached DOM-узлов (skill `chrome-devtools-mcp:memory-leak-debugging`).
2. `performance_start_trace` 30 с при грозе + метро — long tasks > 50 мс и FPS.
3. Playwright-стресс `e2e/qa-stress.spec.ts`: быстрая смена локаций/погоды, затем `performance.memory.usedJSHeapSize` (Chromium) и `document.querySelectorAll('*').length` — рост < 10 % после GC.
4. Эмуляция фона: `page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))` с подменой `document.hidden`, либо CDP `Page.setWebLifecycleState({state:'frozen'})` → `active`.

## Критерии приёмки
- [ ] Heap и число DOM-узлов выходят на плато (нет линейного роста) за 30 мин ускоренного времени
- [ ] Скрытие вкладки на 10 мин → возврат: музыка продолжается ≤ 1 с, нет «лавины» событий, нет ошибок в консоли
- [ ] freeze → resume не ломает сцену и звук
- [ ] Каждый новый listener/interval/node имеет cleanup (проверено чтением кода)
