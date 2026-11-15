import { type ReactNode, useId } from 'react'
import { Clouds, Stars } from './art/primitives'
import { SharedDefs, TEX } from './art/materials'

/** Слой параллакса ВНУТРИ svg (перерисовывает svg при движении курсора — для мелких групп). */
export function Parallax({ depth, children }: { depth: number; children: ReactNode }) {
  return (
    <g style={{ transform: `translate(calc(var(--px) * ${depth}px), calc(var(--py) * ${depth * 0.35}px))`, transition: 'transform .35s ease-out' }}>
      {children}
    </g>
  )
}

/** Небо: градиент, звёзды, солнце, луна (облака — отдельная палуба в SceneShell). Цвета берутся из CSS-переменных освещения. */
export function SkyLayer({ horizon = 600 }: { horizon?: number }) {
  return (
    <g>
      <rect x="-200" y="-100" width="2000" height={horizon + 120} fill="url(#sky)" />
      {/* мягкое рассеяние у горизонта */}
      <rect x="-200" y={horizon - 260} width="2000" height="300" fill="url(#atmo)" opacity=".6" />
      <Stars />
      <g style={{ transform: 'translate(calc(var(--sun-x) * 1600px), calc(var(--sun-y) * 560px))', opacity: 'var(--sun-o)' }}>
        <circle r="180" fill="url(#sun-g)" opacity=".55" />
        <circle r="70" fill="url(#sun-g)" opacity=".8" />
        <circle r="30" fill="#fffbe6" />
      </g>
      <g style={{ transform: 'translate(calc(var(--moon-x) * 1600px), calc(var(--moon-y) * 560px))', opacity: 'var(--moon-o)' }}>
        <circle r="90" fill="url(#glow-cool)" opacity=".18" />
        <circle r="24" fill="#f4f1e6" />
        <circle r="24" fill="url(#shade-x)" opacity=".7" />
        <circle cx="-7" cy="5" r="4" fill="#d3d0c4" />
        <circle cx="8" cy="-8" r="3" fill="#d3d0c4" />
        <circle cx="5" cy="9" r="2.4" fill="#d3d0c4" />
      </g>
    </g>
  )
}

/**
 * Облачная палуба: отдельный слой, плывёт трансформом div (композитор, без перерисовки SVG).
 * Ширина бокса всегда равна ширине контента (aspect-ratio 32/9, min-width 200%) → петля −50% бесшовна.
 */
function CloudDeck({ count }: { count: number }) {
  return (
    <div className="scene-plane cloud-deck" style={{ transform: 'translate3d(calc(var(--px) * 2px), 0, 0)' }}>
      <div className="cloud-pan ambient-anim">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 3200 900" preserveAspectRatio="xMinYMax slice" aria-hidden>
          <g id="cloud-strip"><Clouds count={count} y={20} /></g>
          <use href="#cloud-strip" x="1600" />
        </svg>
      </div>
    </div>
  )
}

/** Солнце для bloom: только диск, без ореола. */
export function SunBloom() {
  return (
    <g style={{ transform: 'translate(calc(var(--sun-x) * 1600px), calc(var(--sun-y) * 560px))', opacity: 'var(--sun-o)' }}>
      <circle r="40" fill="#fff4d0" />
    </g>
  )
}

const VB = '0 0 1600 900'

/**
 * Бесконечно панорамируемый план (город за окном транспорта): содержимое шириной period=1600
 * повторяется через <use>, а едет весь div (transform → композитор, SVG не перерисовывается).
 * Длительность — CSS-переменная --pan-dur; пауза — [data-stopped='1'] у предка (остановка/светофор).
 */
export function PanPlane({ children, duration, className = '', testId }: { children: ReactNode; duration: number; className?: string; testId?: string }) {
  const id = `pan-${useId().replace(/:/g, '')}`
  return (
    <div className={`scene-plane pan-plane ${className}`} data-testid={testId}>
      <div className="pan-track" style={{ ['--pan-dur' as string]: `${duration}s` }}>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 3200 900" preserveAspectRatio="xMinYMax slice" aria-hidden>
          <g id={id}>{children}</g>
          <use href={`#${id}`} x="1600" />
        </svg>
      </div>
    </div>
  )
}

/**
 * Один план сцены: собственный <svg> в собственном композитном слое.
 * Параллакс двигает div (transform → только композитинг), поэтому статичные дальние планы
 * не перерисовываются, когда внутри соседнего плана идут CSS-анимации (прохожие, частицы).
 */
function Plane({ depth = 0, children, className = '', testId }: { depth?: number; children: ReactNode; className?: string; testId?: string }) {
  return (
    <div
      className={`scene-plane ${className}`}
      data-testid={testId}
      style={depth ? { transform: `translate3d(calc(var(--px) * ${depth}px), calc(var(--py) * ${depth * 0.35}px), 0)` } : undefined}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox={VB} preserveAspectRatio="xMidYMax slice" aria-hidden>
        {children}
      </svg>
    </div>
  )
}

export interface SceneShellProps {
  /** небо (самый дальний план, своя композиция; облака анимируются только здесь) */
  sky?: ReactNode
  /** число облаков (0 — без облачной палубы) */
  clouds?: number
  /** передний план покачивается от ветра (как единое целое, на композиторе) */
  foreSway?: boolean
  /** дальняя архитектура/фон (статичен) */
  back?: ReactNode
  /** готовые слои-div между back и mid (например, PanPlane — город за окном транспорта) */
  underlay?: ReactNode
  /** средний план: окружение (статичен) */
  mid?: ReactNode
  /** основной план: земля, пропсы, персонажи */
  art: ReactNode
  /** передний план (ближе к камере, сильнее параллакс) */
  fore?: ReactNode
  /** свет поверх тонировки (screen) */
  lights?: ReactNode
  /** bloom: только источники света */
  bloom?: ReactNode
  /** класс плана art (например, покачивание вагона) */
  artClassName?: string
  /** глубины параллакса планов */
  depths?: { sky?: number; back?: number; mid?: number; art?: number; fore?: number }
  children?: ReactNode
}

/**
 * Обёртка сцены: планы (sky → back → mid → art → fore) → тонировка (multiply) → грейд → свет → bloom → фактура.
 * bloom — только источники света; люди/листья/дымка туда не попадают.
 * Нижний край кадра всегда виден (xMidYMax slice): обрезается небо, а не земля под панелью.
 */
export function SceneShell({ sky, clouds = 0, foreSway, back, underlay, mid, art, fore, lights, bloom, depths = {}, artClassName, children }: SceneShellProps) {
  const d = { sky: 1.5, back: 4, mid: 7, art: 0, fore: 16, ...depths }
  return (
    <div className="absolute inset-0">
      {/* defs — один раз на сцену; все планы ссылаются на них по id */}
      <svg className="absolute h-0 w-0" aria-hidden focusable="false">
        <SharedDefs />
      </svg>
      <div className="art-layer absolute inset-0">
        {sky && <Plane depth={d.sky}>{sky}</Plane>}
        {sky && clouds > 0 && <CloudDeck count={clouds} />}
        {back && <Plane depth={d.back}>{back}</Plane>}
        {underlay}
        {mid && <Plane depth={d.mid}>{mid}</Plane>}
        <Plane depth={d.art} className={artClassName}>{art}</Plane>
        {fore && <Plane depth={d.fore} className={foreSway ? 'plane-fore fore-sway' : 'plane-fore'}>{fore}</Plane>}
      </div>
      <div className="tint-layer absolute inset-0" />
      <div className="grade-layer absolute inset-0" data-testid="grade" />
      {lights && (
        <div className="scene-plane pointer-events-none">
          <svg className="absolute inset-0 h-full w-full" viewBox={VB} preserveAspectRatio="xMidYMax slice" aria-hidden>
            {lights}
          </svg>
        </div>
      )}
      {/* bloom: размытые источники света (отключается в low-perf) */}
      {bloom && (
        <div className="scene-plane bloom pointer-events-none" data-testid="bloom">
          <svg className="absolute inset-0 h-full w-full" viewBox={VB} preserveAspectRatio="xMidYMax slice" aria-hidden>
            {bloom}
          </svg>
        </div>
      )}
      {/* статичная «живописная» фактура поверх всего арта: мазки + бумага */}
      <div
        className="paint-tex pointer-events-none absolute inset-0"
        style={{ backgroundImage: `url("${TEX.blotchLight}"), url("${TEX.blotch}")` }}
      />
      {children}
    </div>
  )
}
