# ASSET_REQUESTS — недостающие растровые ассеты и промпты

**Статус: ничего из списка не создано.** Инструмента генерации изображений в проекте нет, поэтому ассеты не генерировались и в коде не используются. Сейчас все сцены процедурные (SVG + canvas, см. `ASSET_MANIFEST.md`). Этот файл — заказ на случай, если появится генератор или иллюстратор. Правила форматов, хранения и лицензий — `ASSET_PIPELINE.md`; стиль — `.claude/skills/moscow-visual-art-direction/SKILL.md`.

## Зачем растр (где SVG упирается в потолок)
1. Живописная фактура дальних планов (мазок, атмосферное рассеяние) — процедурный шум даёт «зерно», но не мазок кистью.
2. Сложная архитектура конкретных мест (лепнина сталинок, ГУМ, павильоны ВДНХ) — в SVG дорого по узлам.
3. Свод и мозаики станций метро (Маяковская, Комсомольская, Киевская).

Персонажи, транспорт, пропсы, погода и свет остаются процедурными: так они анимируются позами, реагируют на CSS-переменные света и не ломают стиль.

## Общий шаблон промпта (для всех позиций)
```
Premium cinematic 2.5D city diorama, hand-painted digital illustration, soft painterly brushwork,
atmospheric depth, natural color composition, stylized-realistic, frame from an atmospheric animated film,
Moscow <PLACE>, <LAYER DESCRIPTION>,
frontal view, horizon at 62% of height, building bases at 68% of height, 16:9, 3200x1800,
neutral overcast midday light, no strong cast shadows, no sun disk,
palette anchored on #1b1530 #2a2150 #ffb27a #f06a8f #fff3e2, no pure black, no pure white,
no people, no cars, no text, no letters, no signs with writing, no logos, no UI, no watermark
```
Negative: `cartoon, chibi, flat vector, plastic, 3d render look, photo, photobash, collage, lens flare, neon cyberpunk, text, signage letters, watermark, people, vehicles`.

Требования к серии: одна модель и версия, один seed на серию, одни и те же 2–3 референса (скриншоты текущих сцен `node scripts/shots.mjs`: arbat-clear, tverskaya-light-rain, metro-station-clear), запись `<name>.prompt.md` рядом с исходником (модель, версия, seed, промпт, дата, лицензия сервиса).

## Список
| # | Файл (план) | Слой | Описание | Приоритет |
|---|---|---|---|---|
| 1 | `bg/arbat-back@3200.avif` | background | Старый Арбат: 2–3-этажные особняки XIX века, пилястры, карнизы, пастельные фасады, перспектива пешеходной улицы, вдали высотка МИД в дымке | P1 |
| 2 | `bg/tverskaya-back@3200.avif` | background | Тверская: сталинские 7–9-этажные дома с эркерами и карнизами, широкая улица, вдали Кремлёвская башня в дымке | P1 |
| 3 | `bg/zaryadye-back@3200.avif` | background | Зарядье: холмы-ландшафт, парящий мост над рекой, храмы Варварки, стена Кремля вдали | P2 |
| 4 | `bg/vdnh-back@3200.avif` | background | ВДНХ: центральный павильон со шпилем, аллея, фонтан «Дружба народов» вдали, без людей | P2 |
| 5 | `bg/moscow-city-back@3200.avif` | background | Москва-Сити: группа небоскрёбов со стеклом, отражающим небо (стекло нейтрально-серое — цвет неба добавит свет) | P2 |
| 6 | `bg/courtyard-back@3200.avif` | background | Типичный московский двор: панельные и кирпичные дома, балконы, деревья, детская площадка в дымке | P2 |
| 7 | `metro/mayakovskaya-vault@3200.avif` | background | Станция «Маяковская»: свод с плафонами-мозаиками, стальные арки, мрамор; только свод и колонны, платформа и поезд остаются процедурными | P1 |
| 8 | `metro/komsomolskaya-vault@3200.avif` | background | Станция «Комсомольская» (кольцевая): жёлтый свод, лепнина, люстры | P3 |
| 9 | `masks/<bg>-windows@1600.png` | lighting | Альфа-маска окон для каждого фона 1–6 (белое = окно), чтобы LightingController зажигал окна ночью | P1 (вместе с фоном) |
| 10 | `tex/paint-strokes@512.webp` | material | Бесшовный тайл живописного мазка (серо-нейтральный, альфа) для `paint-tex` вместо процедурного шума | P3 |

### Промпты по позициям (вставляются в `<PLACE>` / `<LAYER DESCRIPTION>` шаблона)
1. `Old Arbat street` / `two- and three-storey 19th-century merchant mansions with pilasters, cornices, pastel facades in ochre, peach and dusty pink, empty pedestrian street paved with stone, distant Stalinist high-rise of the Foreign Ministry softly fading in haze`.
2. `Tverskaya street` / `monumental Stalinist apartment buildings, 7-9 storeys, bay windows, heavy cornices, warm sandstone and terracotta facades, wide empty avenue, Kremlin tower silhouette far away in haze`.
3. `Zaryadye park` / `landscaped green hills with meadow grasses, floating V-shaped bridge over the Moskva river, small old churches of Varvarka street, Kremlin wall far in haze`.
4. `VDNKh exhibition grounds` / `central pavilion with a tall spire and star, symmetrical alley with lanterns, ornate golden fountain in the distance, soviet classicist architecture`.
5. `Moscow City business district` / `cluster of glass skyscrapers of different heights, glass painted neutral grey-blue reflecting soft sky, lower older buildings in front`.
6. `typical Moscow residential courtyard` / `nine-storey panel buildings and five-storey brick khrushchyovkas, balconies with plants, bare birch and linden trees, small playground and benches far away`.
7. `Mayakovskaya metro station hall` / `vaulted ceiling with oval niches containing mosaic panels of sky, polished stainless steel arches, pink rhodonite marble, symmetrical one-point perspective along the hall, only vault and columns, no platform edge, no trains`.
8. `Komsomolskaya metro station, circle line` / `bright yellow baroque vault with white stucco, ornate chandeliers, columns, only vault and columns`.
9. Маска делается из соответствующего фона вручную (Krita), промпт не нужен.
10. `seamless tileable texture` / `neutral grey painterly brush strokes on transparent background, soft gouache texture, low contrast`.

## После получения ассета
1. Проверить лицензию сервиса, положить исходник и `.prompt.md` в `assets/source/...`.
2. Оптимизировать (AVIF + WebP, ≤ 300 КБ @1600), добавить строку в `ASSET_MANIFEST.md`.
3. Встроить как `<image>` в back-план `SceneShell` (план статичен — растр не перерисовывается), проверить матрицу moscow-visual-qa (день/ночь × погода) и замеры памяти/FPS.
