import { useMapStore } from '../../stores/mapStore'
import { CityMap25D } from './CityMap25D'

/** Компактный 2.5D-радар 160×160: участок карты вокруг героя; клик разворачивает полную карту. */
export function MiniRadar() {
  const openMap = useMapStore((s) => s.openMap)
  return (
    <div
      className="zen-ui absolute right-3 top-3 z-10 h-[120px] w-[120px] md:right-5 md:top-5 md:h-[160px] md:w-[160px]"
      data-testid="map-radar-wrap"
    >
      <div
        className="absolute inset-0 overflow-hidden rounded-full border-2 border-[rgba(255,220,190,.35)] bg-[#1a1438] shadow-[0_10px_34px_rgba(8,4,24,.55)]"
        aria-hidden
        inert
      >
        <CityMap25D variant="radar" />
        <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_26px_rgba(14,8,32,.75)]" />
        <span className="pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2 text-[10px] font-bold text-[#ffd6b0]">
          С
        </span>
      </div>
      <button
        type="button"
        onClick={openMap}
        aria-label="Открыть карту города"
        title="Карта города (M)"
        data-testid="map-radar"
        className="absolute inset-0 rounded-full transition hover:bg-white/5 hover:shadow-[0_0_0_3px_rgba(255,178,122,.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ffb27a]"
      />
    </div>
  )
}
