import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { LOCATIONS } from '../../data/locations'
import { useWorldStore } from '../../stores/worldStore'

/** Кинематографичный «занавес» при смене локации: затемнение + чёрные полосы. */
export function Curtain() {
  const transitionTo = useWorldStore((s) => s.transitionTo)
  const on = transitionTo !== null
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden data-testid="curtain" data-active={on}>
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, #241a40 0%, #0d0820 100%)',
          opacity: on ? 1 : 0,
          transition: `opacity ${on ? 650 : 900}ms ease-in-out`,
        }}
      />
    </div>
  )
}

/** Название места: показывается на несколько секунд после прибытия. */
export function TitleCard() {
  const location = useWorldStore((s) => s.location)
  const event = useWorldStore((s) => s.event)
  const started = useWorldStore((s) => s.started)
  const [shown, setShown] = useState<string | null>(null)

  useEffect(() => {
    if (!started) return
    // для транспорта показываем название якоря (куда едем), для остальных — место
    setShown(location)
    const t = setTimeout(() => setShown(null), 2500)
    return () => clearTimeout(t)
  }, [location, started])

  const def = shown ? LOCATIONS[shown as keyof typeof LOCATIONS] : null
  return (
    <AnimatePresence>
      {def && (
        <motion.div
          key={shown}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="pointer-events-none absolute bottom-[150px] right-4 z-10 max-w-[70vw] rounded-2xl px-4 py-2.5 text-right md:bottom-[112px] md:right-7 md:max-w-sm"
          style={{ background: 'rgba(20,14,30,.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
          data-testid="title-card"
        >
          <div className="font-display text-[10px] uppercase tracking-[0.4em] text-[#ffd6b0]/85">{def.district}</div>
          <div className="mt-1 font-display text-xl font-light tracking-wide text-[#fff3e2] md:text-2xl">{def.name}</div>
          {event && (def.kind === 'metro-ride' || def.kind === 'bus') && event.caption && <div className="mt-1 text-xs text-[#fff3e2]/75">{event.caption}</div>}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Название проекта и текущее место — в верхнем левом углу. */
export function TopBar() {
  const location = useWorldStore((s) => s.location)
  const event = useWorldStore((s) => s.event)
  const def = LOCATIONS[location]
  const anchorName = event && event.anchor !== location ? LOCATIONS[event.anchor].name : null
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-2xl border border-white/10 bg-[#1b1530]/55 px-3.5 py-2.5 shadow-[0_6px_24px_rgba(10,6,24,.35)] backdrop-blur-md md:left-5 md:top-5" data-testid="top-bar" style={{ textShadow: '0 1px 2px rgba(20,10,30,.6)' }}>
      <div className="font-display text-sm font-medium tracking-[0.35em] text-[#fff3e2]">
        MOSCOW<span className="text-[#ffb27a]"> LIFE</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-[#fff3e2]/90">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff6b6b]" />
        <span data-testid="location-name">{def.name}</span>
        {anchorName && def.kind !== 'park' && def.kind !== 'street' && <span className="text-[#fff3e2]/65">· у района «{anchorName}»</span>}
      </div>
    </div>
  )
}

/** Ненавязчивая подпись о происходящем. */
export function CaptionToast() {
  const caption = useWorldStore((s) => s.caption)
  const key = useWorldStore((s) => s.captionKey)
  const started = useWorldStore((s) => s.started)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!caption) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 7500)
    return () => clearTimeout(t)
  }, [key, caption])

  return (
    <div className="pointer-events-none absolute left-3 top-[80px] z-10 max-w-[78vw] md:left-5 md:top-[88px] md:max-w-sm" aria-live="polite">
      <AnimatePresence mode="wait">
        {started && visible && caption && (
          <motion.div
            key={key}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.6 }}
            className="rounded-2xl border border-white/10 bg-[#1b1530]/55 px-4 py-2.5 text-[13px] leading-snug text-[#fff3e2] shadow-lg backdrop-blur-md"
            data-testid="caption"
          >
            {caption}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
