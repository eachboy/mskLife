# PROMPTS V2 — эталонные кадры look-dev (16:9)

Составлено арт-директором 16.11.2026 по итогам просмотра 11 черновиков (`drafts/`). Заменяет шаблон из `docs/ASSET_GENERATION_3D.md` §7 для этих шести кадров.

## Что изменено против V1
1. Хвост «21:9» убран: черновики сделаны `--aspect 16:9` (1024x576), модель его игнорирует. Формат задаётся флагом, каше 2.39:1 — настройка UI.
2. «anamorphic 40mm» заменено на объектив из набора Плана §6 (24/35/50/85 мм).
3. Добавлены: направление света, дымка по планам, цветокоррекция по фазе суток, лифтнутые индиго-тени, зерно и виньетка малой силы.
4. Названы приметы района; чужие ориентиры запрещены (в V1 Арбат давал Василия Блаженного, ВДНХ давал МГУ).
5. Правило «кино, а не фотография»: плоскость фокуса, ограниченная палитра, один ключевой свет, без HDR-резкости.

## Общий негатив (если модель его не поддерживает, влить в хвост промта как avoid)
`cartoon, toy, low poly, plastic, oversaturated, HDR look, neon cyberpunk, text, signage letters, watermark, lens flare, chromatic aberration, fisheye, stock photo, tourist snapshot, Saint Petersburg architecture`

Флаги запуска: `--aspect 16:9 --raw --json` (как в черновиках). Чистовой: seedream-5.0-lite, точное 16:9. Один seed на серию. Подпись палитры и плёнки вшита в каждый промт.

---

## 1. Тверская — золотой час
Файл: `tverskaya-v2`
```
Cinematic film still of Tverskaya street in Moscow at golden hour, a very wide avenue about 60 meters across with six traffic lanes and a few cars, flanked by massive Stalinist empire-style buildings of 7 to 9 floors, pale ochre and sand-yellow plastered facades with white pilasters, rusticated granite ground-floor plinth, heavy continuous cornices, stone balustrade balconies, cornice line stepping gently in height, slight uphill perspective along the avenue, shot on a 35mm lens at eye level slightly off-axis, vanishing point at the right third, low sun from the left at 8 degrees above the horizon raking across the carriageway so the left facades glow orange and the right facades fall into indigo shade, long soft shadows cast across the asphalt, sodium streetlamps just turned on, a few warm lit windows, atmospheric haze making the far blocks lighter and cooler, shallow depth of field on the foreground, orange-peach golden hour grade, filmic color grade, deep indigo shadows #1b1530 with lifted blacks (no pure black), warm peach highlights #ffb27a, muted rose accents #f06a8f, no pure white clipping, soft highlight roll-off, three depth layers separated by atmospheric haze, subtle film grain, faint vignette, lofi melancholic mood, stylized realism, no text, no logos, no watermark
```
Лечит: в черновике улица узкая, фасады в духе Петербурга, нет земли и цоколя, дымка слабая.

## 2. Арбат — ночь после дождя
Файл: `arbat-v2`
```
Cinematic film still of the Arbat street in Moscow, late night after rain, a narrow pedestrian street paved with wet granite setts, three to five storey pastel eclectic late-19th-century townhouses with shop windows at ground level and mixed cornices, ornate cast-iron lanterns, at the far end of the street rising above the rooftops the seven-tier Stalinist skyscraper of the Ministry of Foreign Affairs on Smolenskaya Square with its tall spire, softly hazed, perfectly symmetrical one-point perspective, camera at the center of the street at chest height, 35mm lens, a single distant pedestrian with an umbrella, each lantern and lit window leaves a long vertical reflection on the wet setts not brighter than the source, thin drizzle mist, warm sodium lanterns #ffb27a against a deep indigo night sky, a few warm lit windows (about one in three), no glow on walls, bloom only around the lamps, night grade dark blue with warm sources, filmic color grade, deep indigo shadows #1b1530 with lifted blacks (no pure black), warm peach highlights #ffb27a, muted rose accents #f06a8f, no pure white clipping, three depth layers separated by haze, subtle film grain, faint vignette, lofi melancholic mood, stylized realism, no text, no logos, no watermark
```
Лечит: в черновике в конце улицы собор Василия Блаженного (это Красная площадь, P0); нужны высотка МИД и пешеходная брусчатая улица.

## 3. Зарядье и Кремль — сумерки
Файл: `zaryadye-v2`
```
Cinematic film still of the Kremlin seen from Zaryadye Park across the Moskva River at dusk, the curved glass-and-steel arc of the Floating Bridge cantilevered over the river in the left foreground, the red brick Kremlin wall with swallowtail battlements and corner towers with green tent roofs, the Grand Kremlin Palace and the white Ivan the Great Bell Tower with its golden dome behind the wall, dark conifers, granite embankment in the foreground with a few small figures and warm lamps, camera at the park railing, 50mm lens, subject on the right third, sky transitioning from rose-orange at the horizon to blue-violet at the top, thin streaks of cloud, a few warm lit windows and floodlit wall base, Moskva River reflecting the sky in soft ripples, far bank hazed and cooler, dusk grade blue-violet with warm lights, filmic color grade, deep indigo shadows #1b1530 with lifted blacks (no pure black), warm peach highlights #ffb27a, muted rose accents #f06a8f, no pure white clipping, three depth layers separated by haze, subtle film grain, faint vignette, lofi melancholic mood, stylized realism, no text, no logos, no watermark
```
Лечит: в черновике нет моста и парка Зарядья, вид «с набережной»; ориентир Кремля верен.

## 4. Москва-Сити — ночная гроза
Файл: `city-v2`
```
Cinematic film still of the Moscow International Business Center at night during a thunderstorm, seen from the Moskva River embankment, the twisting glass tower Evolution at center, Federation Tower and OKO tower on the sides, camera low at the wet embankment, 24mm lens, slightly looking up, horizon perfectly level, a single forked lightning bolt behind the towers on the right third lighting the underside of heavy violet clouds, rain mist veiling the lower floors so the towers fade into haze toward the street, lit office windows in sparse warm rows (about one in four, #ffcf8a), wet granite embankment in the foreground with long reflections of lamps and tower lights not brighter than the source, sodium streetlamps #ffb27a, bloom only around lamps and windows, dark blue-indigo night grade, filmic color grade, deep indigo shadows #1b1530 with lifted blacks (no pure black), warm peach highlights #ffb27a, muted rose accents #f06a8f, no pure white clipping (lightning limited to a thin bolt), three depth layers separated by haze, subtle film grain, faint vignette, lofi melancholic mood, stylized realism, no text, no logos, no watermark
```
Лечит: в черновике нет земли и мокрого асфальта, нижний край обрезан, дымки между башнями и улицей нет. Композицию (Evolution по центру) сохранить.

## 5. Двор в Хамовниках — снежное утро
Файл: `khamovniki-v2`
```
Cinematic film still of a snowy courtyard in the Khamovniki district of Moscow in the early morning, a typical Moscow yard enclosed by four-storey plastered buildings of mixed heights and ages (a Stalin-era block and a 19th-century yellow-ochre house with a lower brick outbuilding), an arched gateway leading to the street, a small playground with a snow-capped slide and swings, parked cars under snow, bare birch trees, metal roofs with snow and chimneys, wires across the yard, a single warm cast-iron lamp still on, shoveled path across the snow, camera at 1.6 meters on the path, 50mm lens, soft overcast light from the upper left, pale pink-blue dawn sky, snow in blue-lavender shadow, a few warm lit kitchen windows (about one in five), light mist, far wall hazed and lighter, early morning cold rose-blue grade, filmic color grade, deep indigo shadows #1b1530 with lifted blacks (no pure black), warm peach highlights #ffb27a, muted rose accents #f06a8f, snow never pure white (lightest tone lavender-cream), three depth layers separated by haze, subtle film grain, faint vignette, lofi melancholic mood, stylized realism, no text, no logos, no watermark
```
Лечит: в черновике двор-колодец в духе Петербурга со сплошным карнизом; нужны разные высоты, арка, берёзы, детская площадка, машины, провода.

## 6. ВДНХ — ясный полдень
Файл: `vdnh-v2`
```
Cinematic film still of the VDNH exhibition park in Moscow at clear noon, Soviet 1950s exhibition architecture, in the right third the round fountain Friendship of Nations with sixteen gilded female statues standing in the water around a golden wheat sheaf, water jets catching the sun, behind it across the wide granite plaza the Central Pavilion number one: a low cream-coloured Stalinist exhibition pavilion with a six-column portico, a tall tiered tower topped by a slender gilded spire with a red star, flanked on both sides by long low colonnaded pavilions with sculpted reliefs and flagpoles, trees and flowerbeds along the plaza, tiny distant visitors for scale, camera at 1.5 meters on the plaza, 35mm lens, perfectly level horizon, composition off-axis so the fountain leads to the pavilion, high sun from the upper right at 60 degrees, short crisp shadows on the paving, deep blue sky with faint cirrus, warm neutral noon grade, cream stone with peach light on the sunlit side and indigo shade on the shadow side, far pavilions lighter and cooler through light haze, filmic color grade, deep indigo shadows #1b1530 with lifted blacks (no pure black), warm peach highlights #ffb27a, muted rose accents #f06a8f, no pure white clipping on the stone, three depth layers separated by haze, subtle film grain, faint vignette, lofi calm mood, stylized realism, not a university, no skyscraper, no high-rise tower with clock faces, no Moscow State University, no text, no logos, no watermark
```
Лечит: в черновике МГУ на Воробьёвых горах (чужой район, P0), небо плоское; нужны арка главного входа, Центральный павильон и «Дружба народов».
