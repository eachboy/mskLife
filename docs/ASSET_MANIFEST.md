# ASSET_MANIFEST
Внешних файловых ассетов (изображений, аудио, шрифтов-файлов) в репозитории нет. Растровые ассеты не генерировались: генератора изображений в проекте нет. Список того, что было бы полезно сгенерировать, — `ASSET_REQUESTS.md` (статус всех позиций: «не создано»).

| Тип | Источник | Где |
|---|---|---|
| Иллюстрации улиц, парков, двора (планы sky/back/mid/art/fore) | процедурные SVG-компоненты React | src/scenes/OutdoorScene.tsx, src/scenes/art/{primitives,StreetKit,Landmarks}.tsx |
| Метро: станция и вагон (тоннель, станция за окнами, двери, табло) | процедурный SVG + CSS-циклы | src/scenes/MetroScenes.tsx |
| Салон автобуса и такси (город за окнами — PanPlane) | процедурный SVG + CSS | src/scenes/TransportScenes.tsx |
| Кофейня, магазин, офис, дом | процедурный SVG | src/scenes/IndoorScenes.tsx, src/scenes/art/InteriorKit.tsx |
| Материалы (металл, стекло, ткань, дерево, кирпич, плитка, резина) | SVG-градиенты/паттерны + растровые тайлы шума, сгенерированные в коде (data-URI feTurbulence) | src/scenes/art/materials.tsx |
| Персонажи (позы, одежда, вариации) | процедурный SVG | src/scenes/art/Person.tsx, src/features/characters |
| Транспорт | процедурный SVG | src/scenes/art/Vehicles.tsx |
| Погода (дождь 3 слоя, брызги, снег с боке, капли на стекле, туман, молния) | canvas 2D + CSS | src/features/weather/WeatherRenderer.tsx, src/index.css |
| Музыка | процедурный синтез Tone.js (Web Audio), без сэмплов | src/audio |
| Городские/погодные звуки | синтез шума и осцилляторов | src/audio/engine |
| Иконки | lucide-react (ISC/MIT) | npm |
| Шрифты | Manrope, Unbounded (Google Fonts, OFL 1.1), подключаются из index.html | CDN |

Лицензионных ограничений на процедурные ассеты нет. Достопримечательности стилизованы и не копируют чужие изображения. Текст на табло, меню, вывесках — программная типографика.

## 3D-данные города (стадия S2)
Источник данных: OpenStreetMap, © OpenStreetMap contributors, лицензия ODbL — https://www.openstreetmap.org/copyright. Получено через Overpass API (https://overpass-api.de/api/interpreter) скриптом `scripts/city-bake.mjs`; атрибуция обязана быть в README и в настройках приложения.

| Файл | Источник (исходник) | Лицензия | Вес | Содержимое | Дата |
|---|---|---|---|---|---|
| public/city/arbat.bin | assets/source/osm/arbat.json.gz (сырой ответ Overpass, gzip) -> `node scripts/city-bake.mjs arbat` | ODbL | 116496 Б; gzip 49714 Б (лимит 350 КБ: в лимите) | 1075 зданий, 59250 вершин, 33414 треугольников; формат версии 2; sha256 759352113f84d363... | 16.11.2026 |
| public/city/gorky-park.bin | assets/source/osm/gorky-park.json.gz (сырой ответ Overpass, gzip) -> `node scripts/city-bake.mjs gorky-park` | ODbL | 32722 Б; gzip 15619 Б (лимит 350 КБ: в лимите) | 345 зданий, 16640 вершин, 9306 треугольников; формат версии 2; sha256 922ee189c3f1919f... | 16.11.2026 |
| public/city/khamovniki.bin | assets/source/osm/khamovniki.json.gz (сырой ответ Overpass, gzip) -> `node scripts/city-bake.mjs khamovniki` | ODbL | 69072 Б; gzip 31549 Б (лимит 350 КБ: в лимите) | 693 зданий, 35180 вершин, 19729 треугольников; формат версии 2; sha256 585fcf18ee1fef58... | 16.11.2026 |
| public/city/kitay-gorod.bin | assets/source/osm/kitay-gorod.json.gz (сырой ответ Overpass, gzip) -> `node scripts/city-bake.mjs kitay-gorod` | ODbL | 119504 Б; gzip 55644 Б (лимит 350 КБ: в лимите) | 812 зданий, 60335 вершин, 34634 треугольников; формат версии 2; sha256 4a9e9dd29167bb25... | 16.11.2026 |
| public/city/moscow-city.bin | assets/source/osm/moscow-city.json.gz (сырой ответ Overpass, gzip) -> `node scripts/city-bake.mjs moscow-city` | ODbL | 22700 Б; gzip 11414 Б (лимит 350 КБ: в лимите) | 211 зданий, 11545 вершин, 6502 треугольников; формат версии 2; sha256 fda82b6751b9335d... | 16.11.2026 |
| public/city/neskuchny.bin | assets/source/osm/neskuchny.json.gz (сырой ответ Overpass, gzip) -> `node scripts/city-bake.mjs neskuchny` | ODbL | 25166 Б; gzip 12323 Б (лимит 350 КБ: в лимите) | 271 зданий, 12830 вершин, 7156 треугольников; формат версии 2; sha256 afb80c180e29054f... | 16.11.2026 |
| public/city/patriarshy.bin | assets/source/osm/patriarshy.json.gz (сырой ответ Overpass, gzip) -> `node scripts/city-bake.mjs patriarshy` | ODbL | 126494 Б; gzip 54422 Б (лимит 350 КБ: в лимите) | 1092 зданий, 64255 вершин, 36386 треугольников; формат версии 2; sha256 ce3f83ef7d11e37d... | 16.11.2026 |
| public/city/tverskaya.bin | assets/source/osm/tverskaya.json.gz (сырой ответ Overpass, gzip) -> `node scripts/city-bake.mjs tverskaya` | ODbL | 136332 Б; gzip 59305 Б (лимит 350 КБ: в лимите) | 1160 зданий, 69160 вершин, 39216 треугольников; формат версии 2; sha256 2affc7017aaa3f2a... | 16.11.2026 |
| public/city/vdnh.bin | assets/source/osm/vdnh.json.gz (сырой ответ Overpass, gzip) -> `node scripts/city-bake.mjs vdnh` | ODbL | 35128 Б; gzip 17126 Б (лимит 350 КБ: в лимите) | 256 зданий, 17775 вершин, 10159 треугольников; формат версии 2; sha256 aa6e6a8d43142ad0... | 16.11.2026 |
| public/city/zamoskvorechye.bin | assets/source/osm/zamoskvorechye.json.gz (сырой ответ Overpass, gzip) -> `node scripts/city-bake.mjs zamoskvorechye` | ODbL | 108126 Б; gzip 45617 Б (лимит 350 КБ: в лимите) | 1162 зданий, 55180 вершин, 30790 треугольников; формат версии 2; sha256 b549084288aabbe3... | 16.11.2026 |
| public/city/zaryadye.bin | assets/source/osm/zaryadye.json.gz (сырой ответ Overpass, gzip) -> `node scripts/city-bake.mjs zaryadye` | ODbL | 107228 Б; gzip 50851 Б (лимит 350 КБ: в лимите) | 625 зданий, 54040 вершин, 31222 треугольников; формат версии 2; sha256 cbfa218752bdc20c... | 16.11.2026 |
| public/city/index.json | генерируется city-bake.mjs | ODbL (производные данные) | < 4 КБ | bbox, число вершин, размер, sha256 по районам | 16.11.2026 |
