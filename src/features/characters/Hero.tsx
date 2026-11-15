import { memo } from 'react'
import Person, { HERO, type PersonPose } from '../../scenes/art/Person'
import { deriveLook } from '../../simulation/engine/CharacterStateManager'
import { LOCATIONS } from '../../data/locations'
import { useWorldStore } from '../../stores/worldStore'

export interface HeroPlace {
  /** статичное положение */
  x?: number
  y: number
  s?: number
  facing?: 1 | -1
  /** если задано x0/x1 — герой идёт из x0 в x1 за время события */
  x0?: number
  x1?: number
  pose?: PersonPose
  /** переопределить «улицу» для расчёта одежды */
  indoor?: boolean
  /** сидит лицом к камере */
  view?: 'side' | 'front'
  /** сидит с позой рук drink/phone/listen (стул/скамья) */
  seated?: boolean
}

const POSE_MAP: Record<string, PersonPose> = {
  walk: 'walk', sit: 'sit', stand: 'stand', phone: 'phone', drink: 'drink', type: 'type', wait: 'wait', read: 'read', sleep: 'doze',
}

/** Главный герой. Движение — CSS-анимацией на всё время события (без покадровых обновлений React). */
export const Hero = memo(function Hero({ place }: { place: HeroPlace }) {
  const event = useWorldStore((s) => s.event)
  const eventKey = useWorldStore((s) => s.eventKey)
  const season = useWorldStore((s) => s.season)
  const temperature = useWorldStore((s) => s.temperature)
  const weatherKind = useWorldStore((s) => s.weatherKind)
  const location = useWorldStore((s) => s.location)

  const pose: PersonPose = place.pose ?? POSE_MAP[event?.pose ?? 'stand'] ?? 'stand'
  const outdoor = !place.indoor && LOCATIONS[location].outdoor
  const look = deriveLook(season, temperature, weatherKind, outdoor)
  if (place.indoor) {
    look.coat = look.coat === 'winter' ? 'jacket' : look.coat
    look.hat = false
    look.scarf = false
    look.umbrella = false
  }
  const s = place.s ?? 1.2
  const moving = place.x0 !== undefined && place.x1 !== undefined && pose === 'walk'
  const facing: 1 | -1 = place.facing ?? (moving ? ((place.x1! >= place.x0! ? 1 : -1) as 1 | -1) : 1)
  const cup = (event?.props?.includes('coffee') && pose !== 'drink' && pose !== 'sit') || false

  const person = (
    <Person
      pose={pose} facing={facing} palette={HERO} look={look} headphones={pose !== 'type' && pose !== 'drink'} view={place.view} seated={place.seated}
      bag={['home', 'office', 'cafe'].includes(LOCATIONS[location].kind) ? 'none' : 'backpack'} cup={cup} hero scale={1}
      stride={moving ? Math.min(1.5, Math.max(0.75, (70 / (Math.abs(place.x1! - place.x0!) / Math.max(4, event?.duration ?? 20))) * 0.8)) : 0.8}
    />
  )

  if (moving) {
    const dur = Math.max(4, event?.duration ?? 20)
    return (
      <g
        key={eventKey}
        className="ent"
        style={{
          ['--x0' as string]: `${place.x0}px`, ['--x1' as string]: `${place.x1}px`, ['--y' as string]: `${place.y}px`, ['--s' as string]: s,
          animationDuration: `${dur}s`,
        }}
      >
        {person}
      </g>
    )
  }
  return <g transform={`translate(${place.x ?? 800} ${place.y}) scale(${s})`}>{person}</g>
})
