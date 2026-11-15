import { LOCATIONS } from '../../data/locations'
import { useWorldStore } from '../../stores/worldStore'
import type { LocationId } from '../../types'
import { pick } from '../../utils/math'

const BY_KIND: Partial<Record<string, string[]>> = {
  park: ['Где-то неподалёку играет уличный музыкант', 'Стая голубей поднимается над дорожкой', 'Мимо проезжает велосипедист', 'Дети гоняют по аллее на самокатах'],
  street: ['Мимо пробегает курьер с яркой сумкой', 'В витринах загораются тёплые огни', 'Из ближайшей пекарни тянет свежим хлебом', 'Такси мигает аварийкой у обочины'],
  'metro-station': ['Из тоннеля дует тёплый ветер — подходит поезд', 'Эхо объявления гулко разносится по своду'],
  'metro-ride': ['«Осторожно, двери закрываются»', 'Сосед напротив дремлет, уткнувшись в книгу'],
  cafe: ['Бариста взбивает молоко — пахнет карамелью', 'За соседним столиком тихо смеются'],
  bus: ['На остановке объявляют следующую: «Тверская улица»', 'За стеклом проплывают вечерние витрины'],
  office: ['Коллега за соседним столом переговаривается по телефону', 'За окном загорается Москва-Сити'],
  courtyard: ['На третьем этаже кто-то поливает цветы на балконе', 'Скрип качелей разносится по двору'],
  home: ['Чайник тихонько закипает на кухне', 'Свет лампы мягко ложится на страницы'],
}

/** Небольшие «случайные события», оживляющие подписи и мир. */
export class EventManager {
  private cooldown = 25

  constructor(private rng: () => number = Math.random) {}

  tick(dt: number) {
    const s = useWorldStore.getState()
    if (s.paused || !s.started || s.transitionTo) return
    this.cooldown -= dt
    if (this.cooldown > 0) return
    this.cooldown = 38 + this.rng() * 40
    const loc = LOCATIONS[s.location as LocationId]
    const list = BY_KIND[loc.kind]
    if (list?.length) s.setCaption(pick(list, this.rng))
  }

  reset() {
    this.cooldown = 25
  }
}
