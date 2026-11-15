---
name: moscow-city-simulation
description: City simulation logic for MOSCOW LIFE — daily routine generation, scenario modes, hero movement between the 20 locations, travel planning (walk/bus/metro), travel time, character state/outfit, event sequencing, weather simulation. Use this skill whenever touching src/simulation, src/data/locations.ts, src/features/weather logic, adding a location or activity, or debugging "герой телепортировался", wrong order of events, stuck scenario, repeated activities, or time-of-day mismatches.
---

# MOSCOW LIFE — City Simulation

Иллюзия живого города держится на причинности: герой не может оказаться в кафе, не дойдя до него. Любой разрыв цепочки сразу ломает доверие пользователя.

## Модель
- **Данные**: `src/data/locations.ts` — единственный источник локаций (id, тип сцены, координаты/расстояния, ambience, theme, плотность). Новая локация = только данные + при необходимости тип сцены.
- **Время**: 1 реальная сек = 1 игровая минута (`clockMode accelerated|real`), `worldStore.minutes`. Для сна — `clockRate`.
- **Генерация**: `DailyRoutineGenerator` → `ScenarioEngine` (инкрементально: следующий event по часу, погоде, режиму `free|work|rainy|winter|night|random`). Активности — `simulation/scenarios/activities.ts` (`inWindow(hour, win)`).
- **Переходы**: `planTravel(from, to, weather, rng)` в `LocationTransitionManager` вставляет цепочку walk → метро/автобус → walk; `chooseTravelMode(km, weather)`, `travelDuration(mode, km)`. `ScenarioEvent.anchor` — уличная локация для вида за окном.
- **Персонаж**: `deriveLook(season, temperature, weather, outdoor)`.
- **Погода**: `nextSimulatedWeather` + `WeatherTransitionManager` (непрерывные `WeatherParams` лерпятся ~5 Гц); реальная — Open-Meteo с откатом на симуляцию.

## Инварианты
1. **Без телепортов**: смена `location` только через событие перехода из `planTravel`. Проверяй, что `event[i].to === event[i+1].from`.
2. **Монотонное время**: события не пересекаются, сумма длительностей = прошедшее игровое время; переход через полночь корректен.
3. **Нет повторов подряд** одной активности/локации (кроме home ночью).
4. **Детерминизм в тестах**: все случайности через переданный `rng`, а не `Math.random` напрямую.
5. **Режимы уважаются**: rainy — в основном крытые места; night — ночные окна активностей; winter — снег и зимняя одежда.
6. **Правдоподобные времена**: пешком ≈ 4–5 км/ч, метро учитывает спуск/ожидание. Сверяй с `travelDuration`.

## Процесс
1. Сначала тест (superpowers:test-driven-development) в `src/simulation/__tests__/simulation.test.ts`: прогон генератора на N игровых дней с фиксированным seed и проверка инвариантов выше.
2. Реализация.
3. Визуальная проверка цепочки в браузере: dev-хук `window.__ml(location, weather, minutes)`, e2e `qa-full.spec.ts`.

## Чеклист
- [ ] Инварианты 1–3 покрыты тестом на ≥ 7 игровых суток × все режимы
- [ ] Новая локация есть в данных, имеет сцену, достижима из любой другой
- [ ] Подписи/caption события соответствуют действию
