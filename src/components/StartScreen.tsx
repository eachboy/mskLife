import { motion } from 'framer-motion'
import { Headphones } from 'lucide-react'

export function StartScreen({ onEnter, busy }: { onEnter: () => void; busy: boolean }) {
  return (
    <motion.div
      key="start"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(14px)' }}
      transition={{ duration: 1.4, ease: 'easeInOut' }}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center px-6 text-center"
      style={{ background: 'radial-gradient(ellipse at 50% 55%, rgba(27,21,48,.5) 0%, rgba(14,9,32,.88) 75%)', backdropFilter: 'blur(6px)' }}
      data-testid="start-screen"
    >
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 1.1 }}>
        <div className="font-display text-[11px] uppercase tracking-[0.6em] text-[#ffd6b0]/80">lofi · city · life</div>
        <h1 className="mt-4 font-display text-5xl font-light leading-tight tracking-[0.12em] text-[#fff3e2] drop-shadow-[0_6px_30px_rgba(255,150,100,.35)] sm:text-7xl md:text-8xl">
          MOSCOW<span className="block bg-gradient-to-r from-[#ffb27a] to-[#f06a8f] bg-clip-text font-medium text-transparent">LIFE</span>
        </h1>
        <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-[#fff3e2]/75">
          Бесконечный день в большом городе. Музыка рождается прямо сейчас, погода меняется сама, а герой идёт своей дорогой — от скамейки в парке до последнего вагона метро.
        </p>
      </motion.div>

      <motion.button
        type="button"
        onClick={onEnter}
        disabled={busy}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.9 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        className="group relative mt-10 overflow-hidden rounded-full px-10 py-4 font-display text-sm font-semibold tracking-[0.35em] text-[#2b1a2e] disabled:opacity-70"
        style={{ background: 'linear-gradient(90deg, #f4a77a, #ec7f8c)', boxShadow: '0 0 24px rgba(244,167,122,.5), 0 10px 40px rgba(236,127,140,.35)' }}
        data-testid="enter-button"
      >
        <span className="absolute inset-0 -translate-x-full bg-white/30 transition-transform duration-700 group-hover:translate-x-full" />
        <span className="relative">{busy ? 'ЗАПУСК…' : 'ENTER MOSCOW'}</span>
      </motion.button>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 1 }} className="mt-8 flex items-center gap-2 text-xs text-[#fff3e2]/50">
        <Headphones size={14} /> Лучше в наушниках · есть звук
      </motion.div>
    </motion.div>
  )
}
