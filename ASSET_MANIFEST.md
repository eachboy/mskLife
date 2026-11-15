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
