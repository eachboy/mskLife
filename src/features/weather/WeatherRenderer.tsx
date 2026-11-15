import { useEffect, useRef } from 'react'
import { useWorldStore } from '../../stores/worldStore'
import { eventBus } from '../../utils/eventBus'

/** Прямоугольник в координатах сцены 1600×900 (стекло окна/транспорта). */
export interface GlassRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Осадки на canvas + CSS-слои тумана и вспышки молнии.
 *
 * - mode='outdoor': дождь в 3 слоя глубины (дальний — тонкий и медленный, ближний — длинный, полупрозрачный),
 *   брызги на земле, снег в 3 слоя (ближний — боке-спрайты), разряд молнии на отдельном canvas.
 * - mode='window': капли на стекле внутри `glass` (окна кафе, автобуса, лобовое такси), стекают дорожками.
 *
 * Производительность: все частицы — заранее выделенные пулы (без new/splice в кадре), линии одного слоя
 * рисуются одним path, при отсутствии осадков rAF не крутится (опрос раз в 0.5 с), цикл останавливается
 * при document.hidden. lowPerf: меньше частиц, 30 fps, dpr 1, без боке и брызг.
 */
export function WeatherRenderer({ mode, glass }: { mode: 'outdoor' | 'window'; glass?: GlassRect[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const boltRef = useRef<HTMLCanvasElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const lowPerf = useWorldStore((s) => s.lowPerf)
  const glassKey = glass ? glass.map((g) => `${g.x},${g.y},${g.w},${g.h}`).join(';') : ''

  useEffect(() => {
    const canvas = ref.current
    const boltCanvas = boltRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const glassRects: GlassRect[] = glassKey
      ? glassKey.split(';').map((s) => {
          const [x, y, w, h] = s.split(',').map(Number)
          return { x, y, w, h }
        })
      : []

    let w = 0
    let h = 0
    // отображение координат сцены (xMidYMax slice) на экран
    let k = 1
    let ox = 0
    let oy = 0
    const dpr = Math.min(window.devicePixelRatio || 1, lowPerf ? 1 : 1.5)
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      k = Math.max(w / 1600, h / 900)
      ox = (w - 1600 * k) / 2
      oy = h - 900 * k
      if (boltCanvas) {
        boltCanvas.width = canvas.width
        boltCanvas.height = canvas.height
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // ── пулы ──
    const RAIN_MAX = lowPerf ? 240 : 720
    const SNOW_MAX = lowPerf ? 300 : 900
    const SPLASH_MAX = lowPerf ? 0 : 70
    const DROP_MAX = lowPerf ? 40 : 110
    // дождь: x, y, скорость-множитель, слой (0 дальний … 2 ближний)
    const rx = new Float32Array(RAIN_MAX)
    const ry = new Float32Array(RAIN_MAX)
    const rv = new Float32Array(RAIN_MAX)
    const rl = new Uint8Array(RAIN_MAX)
    let rainN = 0
    // снег: x, y, v, радиус, фаза, слой
    const sx = new Float32Array(SNOW_MAX)
    const sy = new Float32Array(SNOW_MAX)
    const sv = new Float32Array(SNOW_MAX)
    const sr = new Float32Array(SNOW_MAX)
    const sp = new Float32Array(SNOW_MAX)
    const sl = new Uint8Array(SNOW_MAX)
    let snowN = 0
    // брызги: x, y, возраст (<0 — свободен)
    const px = new Float32Array(SPLASH_MAX)
    const py = new Float32Array(SPLASH_MAX)
    const pa = new Float32Array(SPLASH_MAX).fill(-1)
    // капли на стекле: x, y, r, скорость, жизнь (<0 — свободна), стекла
    const dx = new Float32Array(DROP_MAX)
    const dy = new Float32Array(DROP_MAX)
    const dr = new Float32Array(DROP_MAX)
    const dv = new Float32Array(DROP_MAX)
    const dl = new Float32Array(DROP_MAX).fill(-1)
    const dg = new Uint8Array(DROP_MAX)

    const RAIN_LAYERS = [
      { share: 0.45, speed: 620, len: 9, width: 0.6, alpha: 0.2 },
      { share: 0.35, speed: 980, len: 18, width: 1, alpha: 0.28 },
      { share: 0.2, speed: 1500, len: 40, width: 1.7, alpha: 0.16 },
    ]
    const SNOW_LAYERS = [
      { r: [0.7, 1.4], v: [22, 36], alpha: 0.6 },
      { r: [1.5, 2.8], v: [40, 66], alpha: 0.88 },
      { r: [7, 13], v: [80, 120], alpha: 0.32 },
    ]
    const layerOf = (i: number, n: number, shares: number[]) => {
      const f = i / Math.max(1, n)
      return f < shares[0] ? 0 : f < shares[0] + shares[1] ? 1 : 2
    }
    // боке-спрайт для ближнего слоя снега (рисуется один раз)
    const bokeh = document.createElement('canvas')
    bokeh.width = bokeh.height = 64
    {
      const b = bokeh.getContext('2d')
      if (b) {
        const g = b.createRadialGradient(32, 32, 2, 32, 32, 32)
        g.addColorStop(0, 'rgba(255,255,255,0.9)')
        g.addColorStop(0.45, 'rgba(255,255,255,0.45)')
        g.addColorStop(1, 'rgba(255,255,255,0)')
        b.fillStyle = g
        b.fillRect(0, 0, 64, 64)
      }
    }

    const resetRain = (i: number, top: boolean) => {
      rx[i] = Math.random() * (w + 300) - 150
      ry[i] = top ? -20 - Math.random() * 120 : Math.random() * h
      rv[i] = 0.85 + Math.random() * 0.3
    }
    const resetSnow = (i: number, top: boolean) => {
      const L = SNOW_LAYERS[sl[i]]
      sx[i] = Math.random() * w
      sy[i] = top ? -14 - Math.random() * 40 : Math.random() * h
      sv[i] = L.v[0] + Math.random() * (L.v[1] - L.v[0])
      sr[i] = L.r[0] + Math.random() * (L.r[1] - L.r[0])
      sp[i] = Math.random() * 6.283
    }
    const spawnSplash = () => {
      for (let i = 0; i < SPLASH_MAX; i++) {
        if (pa[i] >= 0) continue
        // земля: полоса сцены y 660…800
        px[i] = ox + Math.random() * 1600 * k
        py[i] = oy + (660 + Math.random() * 140) * k
        pa[i] = 0
        return
      }
    }
    const spawnDrop = () => {
      if (!glassRects.length) return
      for (let i = 0; i < DROP_MAX; i++) {
        if (dl[i] >= 0) continue
        const g = Math.floor(Math.random() * glassRects.length)
        const r = glassRects[g]
        dg[i] = g
        dx[i] = r.x + Math.random() * r.w
        dy[i] = r.y + Math.random() * r.h * 0.85
        dr[i] = 2.2 + Math.random() * 4
        dv[i] = 0
        dl[i] = 0
        return
      }
    }

    let raf = 0
    let idleTimer = 0
    let last = performance.now()
    let acc = 0
    let drewLast = true
    const frameMs = lowPerf ? 1000 / 30 : 0

    const frame = (now: number) => {
      raf = 0
      const elapsed = now - last
      last = now
      const dt = Math.min(0.05, elapsed / 1000)
      acc += elapsed
      const st = useWorldStore.getState()
      const { rain: R, snow: S, wind: W } = st.weather
      const active = mode === 'outdoor' ? R > 0.01 || S > 0.01 || pa.some((a) => a >= 0) : glassRects.length > 0 && (R > 0.03 || dl.some((l) => l >= 0))
      if (!active || st.paused) {
        // нечего рисовать: очищаем один раз и переходим на редкий опрос вместо rAF
        if (drewLast) {
          ctx.clearRect(0, 0, w, h)
          drewLast = false
        }
        schedule(false)
        return
      }
      schedule(true)
      if (frameMs && acc < frameMs) return
      acc = 0
      drewLast = true
      ctx.clearRect(0, 0, w, h)

      if (mode === 'outdoor') {
        // ── дождь: 3 слоя, каждый одним path ──
        const wantRain = Math.floor(RAIN_MAX * R)
        while (rainN < wantRain) {
          rl[rainN] = layerOf(rainN, wantRain, [RAIN_LAYERS[0].share, RAIN_LAYERS[1].share])
          resetRain(rainN, false)
          rainN++
        }
        if (rainN > wantRain) rainN = wantRain
        const slant = 0.1 + W * 0.38
        if (rainN) {
          ctx.lineCap = 'round'
          for (let L = 0; L < 3; L++) {
            const P = RAIN_LAYERS[L]
            const sp2 = P.speed * (0.8 + 0.4 * R) * k
            const len = P.len * k * (0.8 + R * 0.4)
            ctx.beginPath()
            for (let i = 0; i < rainN; i++) {
              if (rl[i] !== L) continue
              const v = sp2 * rv[i]
              ry[i] += v * dt
              rx[i] += v * slant * dt
              if (ry[i] > h + 30) {
                // капля долетела — иногда оставляет брызги
                if (L > 0 && R > 0.2 && Math.random() < 0.35) spawnSplash()
                resetRain(i, true)
              }
              ctx.moveTo(rx[i], ry[i])
              ctx.lineTo(rx[i] - len * slant, ry[i] - len)
            }
            ctx.strokeStyle = `rgba(205,222,255,${P.alpha + 0.12 * R})`
            ctx.lineWidth = P.width * Math.max(1, k)
            ctx.stroke()
          }
        }
        // ── брызги: короткие расходящиеся дуги ──
        if (SPLASH_MAX) {
          if (R > 0.15 && Math.random() < R * 0.9) spawnSplash()
          ctx.beginPath()
          for (let i = 0; i < SPLASH_MAX; i++) {
            if (pa[i] < 0) continue
            pa[i] += dt
            const t = pa[i] / 0.28
            if (t >= 1) {
              pa[i] = -1
              continue
            }
            const rr = (2 + 7 * t) * k
            ctx.moveTo(px[i] - rr, py[i])
            ctx.quadraticCurveTo(px[i], py[i] - rr * 0.9 * (1 - t), px[i] + rr, py[i])
          }
          ctx.strokeStyle = 'rgba(220,232,255,0.35)'
          ctx.lineWidth = Math.max(0.8, k)
          ctx.stroke()
        }
        // ── снег: дальний и средний слои — точки, ближний — боке ──
        const wantSnow = S > 0.01 ? Math.floor(SNOW_MAX * Math.min(1, 0.35 + S * 0.75)) : 0
        while (snowN < wantSnow) {
          sl[snowN] = layerOf(snowN, wantSnow, [0.55, 0.33])
          if (lowPerf && sl[snowN] === 2) sl[snowN] = 1
          resetSnow(snowN, false)
          snowN++
        }
        if (snowN > wantSnow) snowN = wantSnow
        if (snowN) {
          const drift = (24 + W * 170) * k
          for (let L = 0; L < 2; L++) {
            ctx.beginPath()
            for (let i = 0; i < snowN; i++) {
              if (sl[i] !== L) continue
              sy[i] += sv[i] * k * dt * (1 + S * 0.35)
              sp[i] += dt * (0.7 + L * 0.4)
              sx[i] += Math.sin(sp[i]) * 18 * k * dt + drift * (0.6 + L * 0.3) * dt
              if (sy[i] > h + 8) resetSnow(i, true)
              if (sx[i] > w + 12) sx[i] = -12
              const r = sr[i] * Math.max(1, k)
              ctx.moveTo(sx[i] + r, sy[i])
              ctx.arc(sx[i], sy[i], r, 0, 6.283)
            }
            ctx.fillStyle = `rgba(255,255,255,${SNOW_LAYERS[L].alpha})`
            ctx.fill()
          }
          ctx.globalAlpha = SNOW_LAYERS[2].alpha
          for (let i = 0; i < snowN; i++) {
            if (sl[i] !== 2) continue
            sy[i] += sv[i] * k * dt
            sp[i] += dt * 1.1
            sx[i] += Math.sin(sp[i]) * 30 * k * dt + drift * 1.4 * dt
            if (sy[i] > h + 30) resetSnow(i, true)
            if (sx[i] > w + 30) sx[i] = -30
            const d = sr[i] * 2 * Math.max(1, k)
            ctx.drawImage(bokeh, sx[i] - d / 2, sy[i] - d / 2, d, d)
          }
          ctx.globalAlpha = 1
        }
      } else {
        // ── капли на стекле: бусины, которые иногда срываются и стекают дорожкой ──
        ctx.save()
        ctx.beginPath()
        for (const g of glassRects) ctx.rect(ox + g.x * k, oy + g.y * k, g.w * k, g.h * k)
        ctx.clip()
        if (R > 0.03 && Math.random() < 0.6 * R) spawnDrop()
        for (let i = 0; i < DROP_MAX; i++) {
          if (dl[i] < 0) continue
          dl[i] += dt
          if (dv[i] === 0 && dl[i] > 1.5 && Math.random() < 0.008 + R * 0.01) dv[i] = 40 + Math.random() * 70
          dy[i] += dv[i] * dt
          dv[i] *= 0.992
          const g = glassRects[dg[i]]
          if (dy[i] > g.y + g.h + 6 || dl[i] > 14 || (R < 0.02 && dl[i] > 3)) {
            dl[i] = -1
            continue
          }
          const X = ox + dx[i] * k
          const Y = oy + dy[i] * k
          const r = dr[i] * k
          if (dv[i] > 4) {
            ctx.strokeStyle = 'rgba(214,230,255,0.16)'
            ctx.lineWidth = r * 0.7
            ctx.beginPath()
            ctx.moveTo(X, Y - Math.min(60, dv[i] * 0.6) * k)
            ctx.lineTo(X, Y)
            ctx.stroke()
          }
          ctx.fillStyle = 'rgba(205,224,255,0.32)'
          ctx.beginPath()
          ctx.ellipse(X, Y, r * 0.75, r, 0, 0, 6.283)
          ctx.fill()
          ctx.fillStyle = 'rgba(20,24,40,0.18)'
          ctx.beginPath()
          ctx.ellipse(X, Y + r * 0.35, r * 0.6, r * 0.45, 0, 0, 6.283)
          ctx.fill()
          ctx.fillStyle = 'rgba(255,255,255,0.6)'
          ctx.beginPath()
          ctx.arc(X - r * 0.25, Y - r * 0.35, r * 0.24, 0, 6.283)
          ctx.fill()
        }
        ctx.restore()
      }
    }

    // активный режим — rAF; простой — опрос раз в 0.5 с (почти нулевая нагрузка при ясной погоде)
    const schedule = (activeNow: boolean) => {
      if (document.hidden || raf || idleTimer) return
      if (activeNow) raf = requestAnimationFrame(frame)
      else
        idleTimer = window.setTimeout(() => {
          idleTimer = 0
          last = performance.now()
          raf = requestAnimationFrame(frame)
        }, 500)
    }
    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      if (idleTimer) window.clearTimeout(idleTimer)
      raf = 0
      idleTimer = 0
    }
    const onVis = () => {
      if (document.hidden) stop()
      else {
        last = performance.now()
        schedule(true)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    schedule(true)

    // ── молния: вспышка (CSS) + разряд (canvas), синхронно с eventBus 'lightning' ──
    let boltTimer = 0
    const drawBolt = (distance: number) => {
      const bctx = boltCanvas?.getContext('2d')
      if (!boltCanvas || !bctx || mode !== 'outdoor' || distance > 0.75) return
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      bctx.clearRect(0, 0, w, h)
      // ломаная от облаков к линии крыш (y сцены ≈ 90 → 330…400), ветвления
      let x = ox + (250 + Math.random() * 1100) * k
      let y = oy + 90 * k
      const end = oy + (330 + Math.random() * 70) * k // над линией крыш, а не перед домами
      const pts: [number, number][] = [[x, y]]
      while (y < end) {
        y += (18 + Math.random() * 34) * k
        x += (Math.random() - 0.5) * 60 * k
        pts.push([x, y])
      }
      const near = 1 - distance
      const stroke = (width: number, color: string, blur: number) => {
        bctx.shadowColor = '#cfe0ff'
        bctx.shadowBlur = blur
        bctx.strokeStyle = color
        bctx.lineWidth = width
        bctx.beginPath()
        bctx.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < pts.length; i++) bctx.lineTo(pts[i][0], pts[i][1])
        bctx.stroke()
        // ветка
        const j = Math.floor(pts.length * (0.3 + Math.random() * 0.3))
        if (pts[j]) {
          let [bx, by] = pts[j]
          bctx.beginPath()
          bctx.moveTo(bx, by)
          for (let n = 0; n < 4; n++) {
            bx += (20 + Math.random() * 30) * k * (Math.random() < 0.5 ? -1 : 1)
            by += (16 + Math.random() * 26) * k
            bctx.lineTo(bx, by)
          }
          bctx.lineWidth = width * 0.5
          bctx.stroke()
        }
      }
      bctx.lineJoin = 'round'
      stroke((3 + 3 * near) * k, 'rgba(210,225,255,0.55)', lowPerf ? 0 : 18)
      stroke((1 + near) * k, 'rgba(255,255,255,0.95)', 0)
      boltCanvas.style.transition = 'none'
      boltCanvas.style.opacity = '1'
      window.clearTimeout(boltTimer)
      boltTimer = window.setTimeout(() => {
        boltCanvas.style.transition = 'opacity .45s ease-out'
        boltCanvas.style.opacity = '0'
      }, 110)
    }
    const offLightning = eventBus.on('lightning', ({ distance }) => {
      const el = flashRef.current
      if (el) {
        const near = 1 - Math.max(0, Math.min(1, distance))
        el.style.setProperty('--flash', String((mode === 'outdoor' ? 0.55 : 0.3) + 0.4 * near))
        el.style.animation = 'none'
        void el.offsetWidth
        el.style.animation = 'lightning 0.9s ease-out'
      }
      drawBolt(distance)
    })
    return () => {
      stop()
      ro.disconnect()
      offLightning()
      window.clearTimeout(boltTimer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [mode, lowPerf, glassKey])

  return (
    <>
      {/* туман слоями: низовой плотный у земли, средний пласт, дальняя дымка (растворяет горизонт) */}
      {mode === 'outdoor' && (
        <div className="fog-wrap pointer-events-none absolute inset-0 overflow-hidden" data-testid="fog">
          <div className="fog-haze absolute inset-0" />
          <div className="fog-band fog-mid" />
          <div className="fog-band fog-low" />
        </div>
      )}
      <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" data-testid="weather-canvas" />
      <canvas ref={boltRef} className="pointer-events-none absolute inset-0 h-full w-full opacity-0" style={{ mixBlendMode: 'screen' }} />
      <div ref={flashRef} className="lightning-flash pointer-events-none absolute inset-0 opacity-0" />
    </>
  )
}
