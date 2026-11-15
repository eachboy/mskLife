# DEVELOPMENT WORKFLOW — MOSCOW LIFE

## Роли
| Роль | Агент | Зона (кто правит файлы) |
|---|---|---|
| Project Architect | architect (главный поток) | План, контракты, src/types, приёмка |
| World Designer | world-simulation-engineer | src/data, src/simulation, логика погоды, worldStore |
| Audio Engineer | audio-engineer | src/audio |
| Graphics Engineer | graphics-engineer | src/scenes, WeatherRenderer, EntityLayer, characters |
| Frontend Developer | frontend | src/components, src/app, index.css |
| QA | qa-engineer | тесты, e2e, отчёт |
| Visual Art Director | visual-art-director | только оценка, вето |
| User Simulator | user-simulator | только оценка, вето |
| Perf / Security | browser-performance-engineer, security-reviewer | замеры / аудит |

Правило: у файла один владелец на этап. Параллельно — только независимые задачи без общих файлов (типы и stores меняет architect заранее, до раздачи задач).

## Новая функция (пример: «улучшить систему дождя»)
1. **Architect**: `superpowers:brainstorming` → изучить код (WeatherManager, WeatherRenderer, WeatherSoundEngine, lighting) → план с контрактами (какие поля WeatherParams, какие события eventBus) → записать в PROGRESS.md.
2. **World Designer**: логика интенсивности/переходов дождя, тесты (TDD).
3. **Audio Engineer** (параллельно, если контракт готов): звук дождя по `weather.rain`, кроссфейды, замер `audio-meter`.
4. **Graphics Engineer** (параллельно): частицы, лужи, `--wet`, капли на стекле в интерьерах.
5. **Frontend**: интеграция в UI (подписи, настройки), доступность.
6. **QA**: `npm run verify`, e2e, `e2e:visual` (эталоны обновить осознанно), `npm run qa`.
7. **Visual Art Director**: скриншоты матрицы → вердикт.
8. **User Simulator**: «хочется ли смотреть на дождь 20 минут» → вердикт.
9. **Architect**: сводит замечания P0/P1/P2, возвращает исполнителям.
10. Исполнители исправляют → 11. **QA** повторно (включая смежные сценарии). Затем `/code-review` и запись в PROGRESS.md.

## Работа со звуком
Всегда skill `moscow-audio-engineering`. Баги — `superpowers:systematic-debugging`: воспроизвести → изолировать шину → тест → исправить → замер до/после. Никаких новых AudioContext; планирование только по `time`. Отчёт честно разделяет «замерено» и «прослушано».

## Новая локация
1. Данные в `src/data/locations.ts` (id, kind/тип сцены, outdoor, расстояния/координаты, ambience, theme, плотность).
2. Если тип сцены новый — компонент в `src/scenes` по Style Guide (skill moscow-visual-art-direction), свет через CSS-переменные.
3. Достижимость и переходы — тест в `src/simulation/__tests__` (skill moscow-city-simulation).
4. Добавить в матрицу `e2e/visual.spec.ts` и `scripts/shots.mjs`, создать эталон.
5. Ambience-звук локации — audio-engineer.

## Новый персонаж / прохожий
1. Силуэт и позы в `src/scenes/art/Person.tsx` (палитра, сезонная одежда через `deriveLook`).
2. Спавн в `EntityLayer` с лимитом и страховочным удалением (long-session-stability), без наложений, z-order по y.
3. Скриншоты день/ночь/дождь/снег → visual-art-director.

## Тестирование
| Когда | Что |
|---|---|
| Каждая правка | хук: Biome lint файла |
| Конец хода с правками | хук: typecheck + unit |
| Завершение задачи | `npm run verify` + релевантные e2e |
| Завершение этапа / перед релизом | `npm run qa` (полный отчёт), `/code-review`, `/security-review`, user-simulator |

## Приёмка работы агента
Принимается, только если в ответе агента есть: что изменено (файлы), чем проверено (команды и их результат), что НЕ проверено. Architect перепроверяет ключевое сам (запускает команду, смотрит скриншот). Формулировки «должно работать» без доказательства = возврат. Ревьюеры (art director, user simulator) дают вердикт и приоритеты; P0 блокирует приёмку, P1 — фиксится в этом этапе или явно переносится в PROGRESS.md, P2 — в бэклог.
