import { create } from 'zustand'

/** Состояние UI городской карты (не симуляции). */
export interface MapState {
  open: boolean
  /** выбранная точка: id локации или 'hero' */
  selected: string | null
  /** идёт «наезд камеры» из карты в сцену */
  diving: boolean
  /** сразу после наезда сцена проявляется из приближения (SceneStage) */
  arriving: boolean
  openMap: () => void
  closeMap: () => void
  toggleMap: () => void
  select: (id: string | null) => void
  setDiving: (v: boolean) => void
  /** конец наезда: карта закрывается, сцена «приезжает» */
  endDive: () => void
}

let arriveTimer: ReturnType<typeof setTimeout> | null = null

export const useMapStore = create<MapState>((set) => ({
  open: false,
  selected: null,
  diving: false,
  arriving: false,
  openMap: () => set({ open: true, selected: null, diving: false }),
  closeMap: () => set({ open: false, selected: null, diving: false }),
  toggleMap: () => set((s) => ({ open: !s.open, selected: null, diving: false })),
  select: (selected) => set({ selected }),
  setDiving: (diving) => set({ diving }),
  endDive: () => {
    set({ open: false, selected: null, diving: false, arriving: true })
    if (arriveTimer) clearTimeout(arriveTimer)
    arriveTimer = setTimeout(() => {
      arriveTimer = null
      set({ arriving: false })
    }, 1000)
  },
}))
