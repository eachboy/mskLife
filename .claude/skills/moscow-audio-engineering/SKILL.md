---
name: moscow-audio-engineering
description: Audio engineering for MOSCOW LIFE — the procedural Tone.js LoFi music engine, city/weather sound engines, mixer and master chain in src/audio. Use this skill for ANY change or bug touching sound: clicks, pops, crackle, clipping, distortion, "звук хрипит/щёлкает/пропадает", volume balance, BPM/tempo, chords, melody, drums, vinyl noise, rain/thunder/traffic sounds, AudioContext start/suspend, scheduling or timing drift — even if the user only says "музыка странная" or asks for a new instrument.
---

# MOSCOW LIFE — Audio Engineering

Звук — половина продукта: пользователь оставляет вкладку играть часами, поэтому один щелчок раз в 5 минут ощущается хуже, чем слабая аранжировка.

## Карта кода
- `src/audio/hooks/useAudioEngine.ts` — жизненный цикл: `start()` только по жесту пользователя (ENTER), создание движков, cleanups, `visibilitychange → mixer.suspend()/resume()`. В dev / `?audiodebug` — `window.__audio = { T, mixer, music, weather, city }`.
- `src/audio/engine/AudioMixer.ts` — шины music / city / weather → мастер (WaveShaper soft-clip > 0.7). Громкости из `audioStore`.
- `src/audio/engine/MusicEngine.ts` — `Transport.scheduleRepeat(tick, '16n')`; все триггеры обёрнуты в `safe()`; время события = аргумент `time` колбэка.
- `src/audio/engine/{City,Weather}SoundEngine.ts` — синтез шума/осцилляторов, реакция на `eventBus` (lightning, footstep, vehicle-pass) и `worldStore.weather`.
- `src/audio/generators/*` — чистые детерминированные генераторы (seeded `rng.ts`), покрыты `generators.test.ts`.
- `scripts/audio-meter.mjs` — headless-замер пиков/NaN/клиппинга на production-сборке.

## Инварианты (почему они важны)
1. **Один AudioContext** — только через Tone (`T.getContext()`). Второй контекст = рассинхрон и двойная нагрузка; не подключай библиотеки, которые создают свой.
2. **Планирование по `time` из колбэка, никогда не `T.now()`/`setTimeout` внутри tick** — иначе джиттер главного потока превращается в рваный грув.
3. **Без мгновенных скачков параметров**: gain/frequency меняй через `rampTo`/`linearRampToValueAtTime` (≥ 10–30 мс). Скачок = щелчок. Атака огибающих ≥ 3–5 мс.
4. **BPM не через `rampTo`** (исторически давал дрейф) — меняется только на границе такта.
5. **Headroom**: сумма шин ≤ 0.9, пики ≤ −6 dBFS до soft-clip. Не добавляй компрессор/лимитер с авто-makeup (Chrome DynamicsCompressor накачивает).
6. **Полифония ограничена** (сейчас 10) — переполнение голосов крадёт ноты с щелчком.
7. **Любой `new Tone.X` имеет парный `dispose()`** в cleanups — иначе утечка нод при повторном старте.
8. Автовоспроизведение — только после жеста пользователя (политика браузеров).

## Процесс работы с багом звука (superpowers:systematic-debugging)
1. **Воспроизвести**: собрать и замерить — `node scripts/audio-meter.mjs` (см. шапку скрипта), или в dev `window.__audio` + `Tone.Meter` на нужной шине. Зафиксируй, какая шина и с какой периодичностью.
2. **Изолировать**: глуши шины/инструменты по одному (`mixer` gain → 0), пока артефакт не исчезнет.
3. **Гипотеза → тест**: для генераторов — vitest-тест на диапазоны (velocity 0..1, частоты конечны, нет NaN, длительности > 0). Для движка — тест на отсутствие мгновенных `value =` в горячих путях.
4. **Исправить минимально**, повторить замер, сравнить цифры до/после.
5. Честно сообщить: «замерено автоматически» ≠ «прослушано». Если на слух не проверено — так и скажи.

## Чеклист перед сдачей
- [ ] `npm test` (generators + engine) зелёный
- [ ] `audio-meter`: нет NaN, нет клипа, пик ≤ −6 dBFS, лимитер/soft-clip почти не работает
- [ ] Нет новых AudioContext, все новые ноды dispose()
- [ ] Смена погоды/локации — плавные кроссфейды, без пауз в музыке
- [ ] Скрытие вкладки → suspend, возврат → resume без «взрыва» накопленных событий
- [ ] Для длительных сессий см. skill `long-session-stability`

Документация Tone.js / Web Audio — через Context7 (`/tonejs/tone.js`), проверяй версию в package.json (tone ^15).
