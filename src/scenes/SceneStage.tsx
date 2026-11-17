import { lazy, Suspense } from 'react'
import { useMapStore } from '../stores/mapStore'
import { useWorldStore } from '../stores/worldStore'

// 3D-мир — единственный рендер; отдельный ленивый чанк: стартовый экран не грузит three
const World3D = lazy(() => import('../world3d/World3D'))

/** Полноэкранная 3D-сцена + виньетка и зерно. Локация меняется «под занавесом». */
export function SceneStage() {
  const location = useWorldStore((s) => s.location)
  const lowPerf = useWorldStore((s) => s.lowPerf)
  // после «наезда» с карты сцена проявляется из приближения (кроссфейд с уходящей картой)
  const arriving = useMapStore((s) => s.arriving)

  return (
    <div
      className={`scene-root absolute inset-0 overflow-hidden bg-[#120e24] ${lowPerf ? 'low-perf' : ''} ${arriving ? 'scene-arrive' : ''}`}
      data-location={location}
      data-testid="scene"
    >
      <Suspense fallback={null}>
        <World3D />
      </Suspense>
      {/* кинематографичная виньетка + зерно плёнки */}
      <div className="vignette pointer-events-none absolute inset-0" data-testid="vignette" />
      <div className="film-grain pointer-events-none absolute -inset-[10%]" data-testid="grain" />
    </div>
  )
}
