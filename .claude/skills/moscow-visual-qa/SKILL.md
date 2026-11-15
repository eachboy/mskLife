---
name: moscow-visual-qa
description: Visual QA for MOSCOW LIFE — taking screenshots of every scene type across time of day and weather, spotting rendering artifacts (overlaps, clipping, z-order, missing lights, broken weather), responsive checks (desktop, laptop, mobile portrait), and visual regression against Playwright baselines. Use this skill after any change to scenes, art, lighting, weather rendering, layout or UI panels, before declaring visual work done, or when the user asks "проверь как выглядит", "сделай скриншоты", "что-то съехало".
---

# MOSCOW LIFE — Visual QA

Визуальные ошибки в этом проекте почти никогда не видны в unit-тестах: всё рендерится процедурно и зависит от времени, погоды и размера экрана. Поэтому проверка = скриншоты в матрице условий.

## Инструменты
- **Ручной обзор**: `npm run dev` → `node scripts/shots.mjs [url] [outDir]` (по умолчанию `D:/dev-cache/tmp/shots`) — старт, вход и 12 сочетаний локация×погода×время. Смотри файлы через Read.
- **Регрессия**: `npm run e2e:visual` — `e2e/visual.spec.ts`, `toHaveScreenshot` с детерминированным состоянием (dev-хук `window.__ml`, отключённые анимации). Обновление эталонов — только осознанно: `npm run e2e:update-snapshots` и объяснение, почему картинка поменялась.
- **Доступность UI**: `npm run e2e:a11y` (axe-core).
- **Интерактив**: Playwright MCP (`browser_take_screenshot`, `browser_resize`) для точечных проверок.

## Матрица (минимум для изменённой сцены)
| Время | 09:00 | 14:00 | 19:00 (golden/закат) | 23:00 |
|---|---|---|---|---|
| Погода | clear | light-rain | snow | thunderstorm |
Размеры: 1600×900, 1366×768, 390×844 (мобильный портрет).

## Что искать (по приоритету)
- **P0**: пустой/чёрный кадр, ошибки в консоли, обрезанный герой, UI перекрывает героя, объекты ниже y=790 обрезаются, мигание при смене сцены.
- **P1**: наложение прохожих/транспорта, неверный z-order (кто за кем), свет не включается ночью, снег/дождь за стеклом в интерьере не соответствует погоде, текст UI нечитаем на светлом небе.
- **P2**: неровные швы параллакса, «пластиковые» градиенты, слишком шумное зерно, несоответствие палитре (skill `moscow-visual-art-direction`).

## Отчёт
Для каждой находки: сцена, условия (`__ml(...)`, размер), файл скриншота, ожидание vs факт, приоритет. В конце — вердикт и что перепроверить после исправления.
