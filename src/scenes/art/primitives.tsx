import { memo, type ReactNode } from 'react'
import type { Season } from '../../types'
import { mixHex, mulberry32 } from '../../utils/math'

const INK = '#1a1428'
const SNOW = '#f2f5fc'
const SNOW_SH = '#c9d3ea'

// ═════════════════════ Растительность ═════════════════════

/** Тоновые наборы листвы: [тень, основа, свет, акцент] */
const FOLIAGE: Record<Season, string[][]> = {
  spring: [['#4f7a3c', '#7fae58', '#b6d880', '#d9ec9c'], ['#5a8444', '#8cbb62', '#c2e08a', '#f0c8d8']],
  summer: [['#2f5a34', '#4c8044', '#7aaa58', '#a8c870'], ['#365f3a', '#55894a', '#86b462', '#b0d27a']],
  autumn: [['#8a3a22', '#c8622e', '#eda24a', '#f6cf6c'], ['#7a4a22', '#b47a2e', '#e2b04a', '#f4d878'], ['#6e2e28', '#a8452e', '#d8743a', '#efa85a']],
  winter: [['#3c3644', '#544c5c', '#6c6474', '#888090']],
}

/** Округлая «гребешковая» клякса: дуги наружу, низ слегка приплюснут. */
function blob(cx: number, cy: number, r: number, rng: () => number, bumps = 9, flat = 0.82): string {
  const pts: [number, number][] = []
  const off = rng() * Math.PI
  for (let i = 0; i < bumps; i++) {
    const a = off + (i / bumps) * Math.PI * 2
    const rr = r * (0.84 + rng() * 0.22)
    const s = Math.sin(a)
    pts.push([cx + Math.cos(a) * rr, cy + s * rr * (s > 0 ? flat : 1)])
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < bumps; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % bumps]
    const mx = (x0 + x1) / 2
    const my = (y0 + y1) / 2
    const k = 1.32
    d += ` Q${(cx + (mx - cx) * k).toFixed(1)} ${(cy + (my - cy) * k).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  return `${d} Z`
}

interface TreeProps {
  x: number
  y: number
  s?: number
  season: Season
  seed?: number
  kind?: 'round' | 'lime' | 'pine' | 'birch'
  /** без покачивания (дальние планы — статичны ради производительности) */
  still?: boolean
}

/** Голые ветви: рекурсивное ветвление сужающимися штрихами. */
function branches(x: number, y: number, a: number, len: number, w: number, depth: number, rng: () => number, out: { d: string; w: number }[], tips: [number, number][]) {
  const x1 = x + Math.sin(a) * len
  const y1 = y - Math.cos(a) * len
  const mx = (x + x1) / 2 + (rng() - 0.5) * len * 0.2
  const my = (y + y1) / 2
  out.push({ d: `M${x.toFixed(1)} ${y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`, w })
  if (depth <= 0) {
    tips.push([x1, y1])
    return
  }
  const n = depth > 2 ? 2 : 2 + (rng() < 0.4 ? 1 : 0)
  for (let i = 0; i < n; i++) {
    const na = a + (i - (n - 1) / 2) * (0.5 + rng() * 0.35) + (rng() - 0.5) * 0.2
    branches(x1, y1, na, len * (0.62 + rng() * 0.18), w * 0.62, depth - 1, rng, out, tips)
  }
}

/** Дерево: сужающийся ствол с корой, многотональная крона (тень → основа → свет) + растровая фактура листвы. */
export const Tree = memo(function Tree({ x, y, s = 1, season, seed = 1, kind = 'round', still }: TreeProps) {
  const rng = mulberry32(seed * 7919)
  const sets = FOLIAGE[season]
  const [cDark, cMid, cLight, cAcc] = sets[seed % sets.length]
  const birch = kind === 'birch'
  const trunk = birch ? '#e8e2d6' : '#4e3a30'
  const trunkD = birch ? '#8a8478' : '#2e2028'
  const bare = season === 'winter'
  const H = kind === 'lime' ? 170 : 150
  const swayStyle = still
    ? undefined
    : { ['--sway' as string]: `${0.6 + (seed % 3) * 0.35}deg`, ['--sway-dur' as string]: `${5 + (seed % 5) * 0.8}s` }

  let crown: ReactNode
  if (bare) {
    const segs: { d: string; w: number }[] = []
    const tips: [number, number][] = []
    for (let i = 0; i < 3; i++) branches(0, -H * 0.55 - i * 18, (i - 1) * 0.55 + (rng() - 0.5) * 0.2, 52 + rng() * 14, 6.5 - i, 3, rng, segs, tips)
    crown = (
      <g fill="none" strokeLinecap="round">
        {segs.map((sg, i) => <path key={i} d={sg.d} stroke={i % 3 ? trunk : trunkD} strokeWidth={Math.max(0.8, sg.w)} />)}
        <g className="snow-cap">
          {segs.filter((_, i) => i % 2 === 0).map((sg, i) => <path key={i} d={sg.d} stroke={SNOW} strokeWidth={Math.max(0.8, sg.w * 0.55)} transform="translate(0 -1.6)" />)}
        </g>
      </g>
    )
  } else if (kind === 'pine') {
    const tiers = [0, 1, 2, 3, 4]
    const tierD = (i: number, grow = 0) => {
      const w = 64 - i * 11 + grow
      const top = -60 - i * 38
      const b = top + 46
      let d = `M${-w} ${b}`
      const n = 6
      for (let k = 0; k <= n; k++) {
        const px = -w + (2 * w * k) / n
        d += ` Q${(px - w / n).toFixed(1)} ${b + 7} ${px.toFixed(1)} ${b}`
      }
      return `${d} L0 ${top - 18} Z`
    }
    crown = (
      <g>
        {tiers.map((i) => <path key={i} d={tierD(i)} fill={i % 2 ? '#2e5a40' : '#2a5038'} />)}
        {tiers.map((i) => <path key={`h${i}`} d={tierD(i, -18)} fill="#4a7a56" opacity=".55" transform="translate(-8 -4)" />)}
        <g className="snow-cap">{tiers.map((i) => <path key={i} d={`M${-36 + i * 6} ${-30 - i * 38} Q0 ${-50 - i * 38} ${36 - i * 6} ${-30 - i * 38} L0 ${-76 - i * 38} Z`} fill={SNOW} />)}</g>
      </g>
    )
  } else {
    const lobes = Array.from({ length: kind === 'lime' ? 8 : 7 }, () => ({
      cx: (rng() - 0.5) * 92, cy: -H - rng() * 70 + 26, r: 30 + rng() * 20,
    }))
    const dark = lobes.map((l) => blob(l.cx + 6, l.cy + 10, l.r, rng)).join(' ')
    const mid = lobes.map((l) => blob(l.cx, l.cy, l.r * 0.9, rng)).join(' ')
    const light = lobes.filter((l) => l.cy < -H + 8).map((l) => blob(l.cx - l.r * 0.28, l.cy - l.r * 0.3, l.r * 0.52, rng, 7)).join(' ')
    const spots = season === 'autumn' || season === 'spring'
      ? lobes.slice(0, 4).map((l) => blob(l.cx + l.r * 0.2, l.cy - l.r * 0.1, l.r * 0.3, rng, 6)).join(' ')
      : ''
    crown = (
      <g>
        {/* ветви, уходящие в крону */}
        <path d={`M0 ${-H * 0.5} Q-14 ${-H * 0.72} -30 ${-H * 0.92} M2 ${-H * 0.56} Q16 ${-H * 0.78} 34 ${-H * 0.96} M0 ${-H * 0.6} L2 ${-H}`} stroke={trunk} strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d={dark} fill={cDark} />
        <path d={mid} fill={cMid} />
        <path d={mid} fill="url(#tex-foliage)" opacity=".7" />
        {light && <path d={light} fill={cLight} opacity=".9" />}
        {spots && <path d={spots} fill={cAcc} opacity=".75" />}
        <path d={dark} fill="url(#ao-up)" opacity=".5" />
        <g className="snow-cap">{lobes.filter((l) => l.cy < -H + 10).map((l, i) => <ellipse key={i} cx={l.cx - 4} cy={l.cy - l.r * 0.72} rx={l.r * 0.6} ry={l.r * 0.2} fill={SNOW} />)}</g>
      </g>
    )
  }

  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="6" cy="2" rx="58" ry="9" fill="url(#contact)" />
      {/* ствол с корнями и корой */}
      <path d={`M-10 2 Q-6 -${H * 0.3} -4 -${H * 0.66} L4 -${H * 0.66} Q6 -${H * 0.3} 11 2 Q4 -2 0 1 Q-5 -2 -10 2 Z`} fill={trunk} />
      <path d={`M-10 2 Q-6 -${H * 0.3} -4 -${H * 0.66} L4 -${H * 0.66} Q6 -${H * 0.3} 11 2 Q4 -2 0 1 Q-5 -2 -10 2 Z`} fill="url(#shade-x)" />
      {birch
        ? <path d={`M-6 -20 h5 M2 -48 h5 M-5 -80 h6 M1 -102 h4`} stroke="#2a2430" strokeWidth="2.4" strokeLinecap="round" />
        : <path d={`M-3 -10 q-2 -24 0 -44 M3 -30 q2 -20 0 -40`} stroke={trunkD} strokeWidth="1.2" opacity=".6" fill="none" />}
      <g className={still ? undefined : 'sway'} style={swayStyle}>
        {crown}
      </g>
    </g>
  )
})

export const Bush = memo(function Bush({ x, y, s = 1, season, seed = 4, flowers }: { x: number; y: number; s?: number; season: Season; seed?: number; flowers?: boolean }) {
  const rng = mulberry32(seed * 131)
  const [cDark, cMid, cLight, cAcc] = FOLIAGE[season][seed % FOLIAGE[season].length]
  const lobes = [[-22, -14, 19], [2, -21, 23], [25, -12, 17], [-6, -8, 16]]
  const dark = lobes.map(([cx, cy, r]) => blob(cx + 3, cy + 4, r, rng, 8)).join(' ')
  const mid = lobes.map(([cx, cy, r]) => blob(cx, cy, r * 0.88, rng, 8)).join(' ')
  const light = lobes.slice(0, 3).map(([cx, cy, r]) => blob(cx - 4, cy - 6, r * 0.45, rng, 6)).join(' ')
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="2" cy="0" rx="46" ry="7" fill="url(#contact)" />
      <path d={dark} fill={cDark} />
      <path d={mid} fill={cMid} />
      <path d={mid} fill="url(#tex-foliage)" opacity=".6" />
      <path d={light} fill={cLight} opacity=".85" />
      {flowers && season !== 'winter' && (
        <g>{Array.from({ length: 9 }, (_, i) => <circle key={i} cx={-28 + rng() * 56} cy={-6 - rng() * 30} r="2.2" fill={i % 2 ? '#f6e3ea' : cAcc} />)}</g>
      )}
      <g className="snow-cap"><path d={`M-30 -26 Q-8 -46 6 -42 Q24 -40 36 -24 Q8 -32 -30 -26 Z`} fill={SNOW} /></g>
    </g>
  )
})

/** Полоса травы/газона с мазками и цветами. */
export function Lawn({ x0, x1, y, h, season, seed = 2 }: { x0: number; x1: number; y: number; h: number; season: Season; seed?: number }) {
  const rng = mulberry32(seed)
  const [cDark, cMid, cLight] = season === 'winter' ? ['#5d6a58', '#6f7a66', '#848c78'] : season === 'autumn' ? ['#5d6a3a', '#7a8446', '#a09a54'] : FOLIAGE.summer[0]
  let tufts = ''
  for (let i = 0; i < 70; i++) {
    const tx = x0 + rng() * (x1 - x0)
    const ty = y + 6 + rng() * (h - 8)
    tufts += `M${tx.toFixed(0)} ${ty.toFixed(0)} l2 -${(4 + rng() * 6).toFixed(0)} l2 ${(4 + rng() * 4).toFixed(0)} `
  }
  return (
    <g>
      <rect x={x0} y={y} width={x1 - x0} height={h} fill={cMid} />
      <rect x={x0} y={y} width={x1 - x0} height={h} fill="url(#tex-foliage)" opacity=".5" />
      <rect x={x0} y={y} width={x1 - x0} height={h * 0.4} fill={cLight} opacity=".25" />
      <path d={tufts} stroke={cDark} strokeWidth="1.4" fill="none" opacity=".6" />
    </g>
  )
}

// ═════════════════════ Фонари / скамейки ═════════════════════

/** Фонарь: классический московский (литьё, фонарь со стеклом) или современный (консоль). */
export const Lamp = memo(function Lamp({ x, y, s = 1, style = 'classic' }: { x: number; y: number; s?: number; style?: 'classic' | 'modern' | 'double' }) {
  const iron = '#24262c'
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="3" cy="1" rx="16" ry="3.5" fill="url(#contact)" />
      {/* постамент */}
      <path d="M-11 0 L-9 -16 Q-6 -20 -5 -26 L5 -26 Q6 -20 9 -16 L11 0 Z" fill={iron} />
      <path d="M-11 0 L-9 -16 Q-6 -20 -5 -26 L5 -26 Q6 -20 9 -16 L11 0 Z" fill="url(#dark-metal-v)" opacity=".7" />
      <rect x="-3" y="-170" width="6" height="146" fill="url(#dark-metal-v)" />
      <rect x="-4.5" y="-110" width="9" height="5" rx="1.5" fill={iron} />
      {style === 'classic' ? (
        <g>
          <path d="M-10 -170 L10 -170 L7 -178 L-7 -178 Z" fill={iron} />
          {/* фонарь: рама + стёкла + свет */}
          <path d="M-11 -206 L11 -206 L8 -180 L-8 -180 Z" fill="#fff3d0" className="win-lit" style={{ opacity: 'calc(.25 + var(--lamps) * .75)' }} />
          <path d="M-11 -206 L11 -206 L8 -180 L-8 -180 Z M0 -206 L0 -180" fill="none" stroke={iron} strokeWidth="1.8" />
          <path d="M-8 -203 L-5 -183" stroke="#fff" strokeWidth="1.2" opacity=".35" />
          <path d="M-14 -206 L0 -218 L14 -206 Z" fill={iron} />
          <circle cx="0" cy="-221" r="2.4" fill={iron} />
        </g>
      ) : style === 'double' ? (
        <g>
          <path d="M0 -168 Q0 -182 -26 -182 M0 -168 Q0 -182 26 -182" stroke={iron} strokeWidth="3.5" fill="none" />
          {[-26, 26].map((dx) => (
            <g key={dx}>
              <path d={`M${dx - 8} -182 L${dx + 8} -182 L${dx + 5} -164 L${dx - 5} -164 Z`} fill="#fff3d0" className="win-lit" style={{ opacity: 'calc(.25 + var(--lamps) * .75)' }} />
              <path d={`M${dx - 10} -182 L${dx} -190 L${dx + 10} -182 Z`} fill={iron} />
            </g>
          ))}
        </g>
      ) : (
        <g>
          <path d="M0 -170 Q0 -192 26 -192" stroke={iron} strokeWidth="4.5" fill="none" />
          <path d="M14 -196 L42 -196 Q44 -190 40 -188 L16 -188 Q12 -190 14 -196 Z" fill="#3a3c46" />
          <rect x="17" y="-189.5" width="22" height="3" rx="1.5" fill="#f4f8ff" className="win-lit" />
        </g>
      )}
      <g className="snow-cap"><path d="M-14 -207 L0 -219 L14 -207 Q0 -214 -14 -207 Z" fill={SNOW} /></g>
    </g>
  )
})

/** Свет фонаря (рисуется поверх тонировки): ореол + конус + пятно на земле. */
export const LampGlow = memo(function LampGlow({ x, y, s = 1, style = 'classic' }: { x: number; y: number; s?: number; style?: 'classic' | 'modern' | 'double' }) {
  const cx = x + (style === 'modern' ? 28 * s : 0)
  const cy = y - (style === 'classic' ? 193 : style === 'double' ? 174 : 188) * s
  return (
    <g className="lamp-lit">
      <circle cx={cx} cy={cy} r={110 * s} fill="url(#glow-warm)" style={{ mixBlendMode: 'screen' }} />
      <path d={`M${cx - 10 * s} ${cy + 10 * s} L${cx - 120 * s} ${y + 4} L${cx + 120 * s} ${y + 4} L${cx + 10 * s} ${cy + 10 * s} Z`} fill="url(#cone-g)" style={{ mixBlendMode: 'screen' }} />
      <ellipse cx={cx} cy={y + 4} rx={130 * s} ry={20 * s} fill="url(#glow-soft)" style={{ mixBlendMode: 'screen' }} />
    </g>
  )
})

/** Парковая скамья: деревянные рейки + чугунные боковины, контактная тень. */
export const Bench = memo(function Bench({ x, y, s = 1, flip = false, snow = true }: { x: number; y: number; s?: number; flip?: boolean; snow?: boolean }) {
  const wood = '#9a6440'
  const woodL = '#c08a5a'
  const woodD = '#6a4028'
  const iron = '#25262c'
  const slat = (yy: number, h: number, c: string) => (
    <g>
      <rect x="-72" y={yy} width="144" height={h} rx="2.2" fill={c} />
      <rect x="-72" y={yy} width="144" height={h * 0.38} rx="1.5" fill={woodL} opacity=".55" />
      <rect x="-72" y={yy + h - 1} width="144" height="1" fill={woodD} opacity=".6" />
    </g>
  )
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <ellipse cx="0" cy="1" rx="92" ry="9" fill="url(#contact)" />
      {/* дальние ножки */}
      <path d="M-58 -44 L-62 -2 M60 -44 L64 -2" stroke="#15161a" strokeWidth="5" />
      {slat(-90, 7, wood)}
      {slat(-79, 7, wood)}
      {slat(-68, 6, wood)}
      {/* сиденье */}
      {slat(-48, 6.5, wood)}
      {slat(-40.5, 6.5, mixHex(wood, INK, 0.08))}
      {/* чугунные боковины с завитком */}
      {[-64, 62].map((bx) => (
        <g key={bx}>
          <path d={`M${bx} -92 Q${bx - 3} -64 ${bx + 2} -46 L${bx + 10} -46 Q${bx + 14} -24 ${bx + 9} 0 L${bx + 3} 0 Q${bx + 6} -22 ${bx + 3} -40 L${bx - 3} -40 Q${bx - 10} -22 ${bx - 6} 0 L${bx - 12} 0 Q${bx - 16} -26 ${bx - 4} -46 Q${bx - 8} -66 ${bx - 5} -92 Z`} fill={iron} />
          <path d={`M${bx - 2} -46 q8 -6 12 0`} stroke="#4a4c56" strokeWidth="1.2" fill="none" />
        </g>
      ))}
      {snow && (
        <g className="snow-cap">
          <rect x="-73" y="-52" width="146" height="5" rx="2.5" fill={SNOW} />
          <rect x="-73" y="-94" width="146" height="5" rx="2.5" fill={SNOW} />
        </g>
      )}
      <g className="wet-sheen"><rect x="-70" y="-48" width="140" height="2" fill="#fff" opacity=".45" /></g>
    </g>
  )
})

// ═════════════════════ Здания ═════════════════════

export type FacadeStyle = 'classic' | 'stalin' | 'modern' | 'panel' | 'brick'

export interface BuildingProps {
  x: number
  w: number
  h: number
  y: number
  color: string
  seed: number
  roof?: 'flat' | 'pitched' | 'mansard' | 'tower'
  floors?: number
  /** доля освещённых окон ночью */
  lit?: number
  shopfront?: boolean
  haze?: number
  hazeColor?: string
  balconies?: boolean
  snow?: boolean
  facade?: FacadeStyle
  /** 0 — дальний план (минимум узлов), 1 — средний, 2 — ближний (интерьеры, карнизы) */
  detail?: 0 | 1 | 2
  /** вывески на витринах (русские названия) */
  signs?: boolean
}

const SIGNS = ['КОФЕ', 'КНИГИ', 'АПТЕКА', 'ЦВЕТЫ', 'ПЕКАРНЯ', 'ПРОДУКТЫ', 'ОПТИКА', 'БИСТРО', 'ЧАЙ', 'ЧАСЫ', 'ВИНИЛ', 'ХЛЕБ', 'СЫРЫ', 'ГАЛЕРЕЯ']
const SIGN_COLS = ['#2a4a46', '#5a2a32', '#26304e', '#3a2c26', '#1e2a2a', '#4a3a22']
const AWN_COLS = ['#a8343e', '#2e6a62', '#c08a2a', '#34406e', '#6a3a5a']
const CURTAINS = ['#d97a6a', '#e0b47a', '#8aa0c0', '#c48aa8', '#9ab07a', '#f0e0c0']

/**
 * Фасад с окнами-интерьерами. Все однотипные элементы (рамы, стёкла, свет, шторы, подоконники)
 * собираются в составные path: десятки окон → единицы DOM-узлов.
 */
export const Building = memo(function Building({
  x, w, h, y, color, seed, roof = 'flat', floors, lit = 0.55, shopfront, haze = 0, hazeColor = '#9aa7c7', balconies, snow = true, facade = 'classic', detail = 1, signs = true,
}: BuildingProps) {
  const rng = mulberry32(seed * 104729)
  const base = haze > 0 ? mixHex(color, hazeColor, haze) : color
  const dark = mixHex(base, '#1c1838', 0.28)
  const darker = mixHex(base, '#140f26', 0.5)
  const light = mixHex(base, '#fff2dc', 0.3)
  const fl = floors ?? Math.max(2, Math.round(h / 58))
  const modern = facade === 'modern'
  const cols = Math.max(2, Math.floor(w / (modern ? 38 : 46)))
  const cellW = w / cols
  const top = y - h
  const shopH = shopfront ? 78 : 0
  const corniceH = detail >= 1 ? (facade === 'stalin' ? 20 : 12) : 6
  const cellH = (h - shopH - corniceH - 6) / fl
  const glassC = haze > 0.4 ? mixHex('#7d92b0', hazeColor, haze) : mixHex('#6f86a8', base, 0.15)

  let reveal = ''
  let glass = ''
  let refl = ''
  let litD = ''
  let litTop = ''
  let flick = ''
  let mull = ''
  let sill = ''
  let sillSnow = ''
  let shade = ''
  const curt: string[] = CURTAINS.map(() => '')
  let props = ''
  let balc = ''
  for (let r = 0; r < fl; r++) {
    for (let c = 0; c < cols; c++) {
      const isLit = rng() < lit
      const ww = cellW * (modern ? 0.86 : 0.5)
      const wh = cellH * (modern ? 0.8 : 0.62)
      const wx = x + c * cellW + (cellW - ww) / 2
      const wy = top + corniceH + 6 + r * cellH + cellH * (modern ? 0.1 : 0.16)
      const R = (xx: number, yy: number, ww2: number, hh: number) => `M${xx.toFixed(1)} ${yy.toFixed(1)}h${ww2.toFixed(1)}v${hh.toFixed(1)}h${(-ww2).toFixed(1)}Z`
      reveal += R(wx - 2.5, wy - 2.5, ww + 5, wh + 5)
      glass += R(wx, wy, ww, wh)
      // отражение неба: диагональный блик в верхней части стекла
      refl += `M${(wx + ww * 0.1).toFixed(1)} ${wy.toFixed(1)}L${(wx + ww * 0.62).toFixed(1)} ${wy.toFixed(1)}L${(wx + ww * 0.12).toFixed(1)} ${(wy + wh * 0.7).toFixed(1)}Z`
      if (isLit) {
        if (rng() < 0.08) flick += R(wx, wy, ww, wh)
        else litD += R(wx, wy, ww, wh)
        litTop += R(wx, wy, ww, wh * 0.42)
        if (detail >= 1 && !modern) {
          // шторы по бокам (интерьер), иногда силуэт лампы/растения
          const ci = Math.floor(rng() * CURTAINS.length)
          const cw = ww * (0.18 + rng() * 0.12)
          curt[ci] += `M${wx.toFixed(1)} ${wy.toFixed(1)}h${cw.toFixed(1)}q${(-cw * 0.4).toFixed(1)} ${(wh * 0.5).toFixed(1)} 0 ${wh.toFixed(1)}h${(-cw).toFixed(1)}Z`
          curt[ci] += `M${(wx + ww).toFixed(1)} ${wy.toFixed(1)}h${(-cw).toFixed(1)}q${(cw * 0.4).toFixed(1)} ${(wh * 0.5).toFixed(1)} 0 ${wh.toFixed(1)}h${cw.toFixed(1)}Z`
          const kind = rng()
          if (kind < 0.25) props += `M${(wx + ww * 0.5 - 4).toFixed(1)} ${(wy + wh * 0.35).toFixed(1)}h8l3 6h-14Z M${(wx + ww * 0.5 - 0.8).toFixed(1)} ${(wy + wh * 0.35 + 6).toFixed(1)}h1.6v${(wh * 0.5).toFixed(1)}h-1.6Z`
          else if (kind < 0.45) props += `M${(wx + ww * 0.3).toFixed(1)} ${(wy + wh).toFixed(1)}q2 -${(wh * 0.35).toFixed(1)} 8 -${(wh * 0.42).toFixed(1)}q3 ${(wh * 0.2).toFixed(1)} 4 ${(wh * 0.42).toFixed(1)}Z`
          else if (kind < 0.55) props += `M${(wx + ww * 0.55).toFixed(1)} ${(wy + wh).toFixed(1)}v-${(wh * 0.38).toFixed(1)}a4.5 4.5 0 1 1 9 0v${(wh * 0.38).toFixed(1)}Z`
        }
      } else if (detail >= 1 && !modern && rng() < 0.4) {
        // тюль/жалюзи в тёмных окнах днём
        shade += R(wx, wy, ww, wh * (0.3 + rng() * 0.5))
      }
      if (!modern) {
        mull += `M${(wx + ww / 2).toFixed(1)} ${wy.toFixed(1)}v${wh.toFixed(1)}M${wx.toFixed(1)} ${(wy + wh * 0.3).toFixed(1)}h${ww.toFixed(1)}`
        sill += R(wx - 4, wy + wh + 1.5, ww + 8, 3.5)
        sillSnow += R(wx - 4, wy + wh - 1, ww + 8, 3)
      }
      if (balconies && r > 0 && c % 2 === 0 && detail >= 1) balc += R(wx - 6, wy + wh - wh * 0.32, ww + 12, wh * 0.32 + 4)
    }
  }

  // карниз / межэтажные тяги
  const courses: ReactNode[] = []
  if (detail >= 1 && !modern) {
    for (let r = 1; r < fl; r++) {
      const yy = top + corniceH + 6 + r * cellH - 2
      if (facade === 'stalin' || r === fl - 1 || (facade === 'classic' && r === 1)) courses.push(<rect key={r} x={x} y={yy} width={w} height="3" fill={light} opacity=".55" />)
    }
  }
  let dentils = ''
  if (detail >= 2 && (facade === 'stalin' || facade === 'classic')) {
    for (let k = 0; k < w / 9; k++) dentils += `M${(x + k * 9 + 2).toFixed(1)} ${top + corniceH - 6}h5v5h-5Z`
  }
  let pilasters = ''
  if (detail >= 1 && facade === 'stalin') {
    for (let c = 0; c <= cols; c++) pilasters += `M${(x + c * cellW - 4).toFixed(1)} ${top + corniceH}h8v${(h - corniceH - shopH).toFixed(1)}h-8Z`
  }
  let panelLines = ''
  if (facade === 'panel') {
    for (let r = 1; r < fl; r++) panelLines += `M${x} ${(top + corniceH + 6 + r * cellH - 3).toFixed(1)}h${w}`
    for (let c = 1; c < cols; c++) panelLines += `M${(x + c * cellW).toFixed(1)} ${top + corniceH}v${h - corniceH - shopH}`
  }

  const shopBays = shopfront ? Math.max(1, Math.round(w / 120)) : 0
  const bayW = shopBays ? w / shopBays : 0

  return (
    <g>
      {/* стена: основа, фактура, свет сверху/затенение снизу, торцы */}
      <rect x={x} y={top} width={w} height={h} fill={base} />
      {detail >= 1 && facade === 'brick' && <rect x={x} y={top} width={w} height={h} fill="url(#pat-brick)" opacity=".7" />}
      {detail >= 1 && <rect x={x} y={top} width={w} height={h} fill="url(#tex-blotch)" opacity=".4" />}
      {detail >= 1 && <rect x={x} y={top} width={w} height={h} fill="url(#tex-grain)" opacity=".35" />}
      <rect x={x} y={top} width={w} height={h} fill="url(#facade-light)" />
      {pilasters && <path d={pilasters} fill={light} opacity=".35" />}
      {panelLines && <path d={panelLines} stroke={dark} strokeWidth="1.4" opacity=".5" />}
      <rect x={x} y={top} width={Math.min(10, w * 0.05)} height={h} fill={light} opacity=".3" />
      <rect x={x + w - Math.min(14, w * 0.07)} y={top} width={Math.min(14, w * 0.07)} height={h} fill={darker} opacity=".35" />
      {/* карниз с тенью под ним */}
      <rect x={x - 3} y={top} width={w + 6} height={corniceH} fill={light} opacity={modern ? 0.2 : 0.75} />
      <rect x={x - 3} y={top + corniceH - 3} width={w + 6} height="3" fill={dark} opacity=".6" />
      {detail >= 1 && <rect x={x} y={top + corniceH} width={w} height="10" fill="url(#ao-down)" opacity=".7" />}
      {dentils && <path d={dentils} fill={dark} opacity=".45" />}
      {courses}
      {/* окна */}
      <path d={reveal} fill={darker} opacity=".8" />
      <path d={glass} fill={glassC} />
      <g className="day-only"><path d={refl} fill="#e8f0fa" opacity={modern ? 0.32 : 0.22} /></g>
      {shade && <path d={shade} fill="#ece4d4" opacity=".55" />}
      <g className="night-only"><path d={glass} fill="#151629" opacity=".72" /></g>
      <g className="win-lit" style={haze > 0 ? { opacity: `calc(var(--lamps) * ${1 - haze * 0.45})` } : undefined}>
        {litD && <path d={litD} fill={modern ? '#f4f0e0' : '#ffc070'} />}
        {flick && <path d={flick} fill="#ffc070" className="flicker" />}
        {litTop && <path d={litTop} fill={modern ? '#ffffff' : '#ffe2a6'} opacity=".7" />}
        {curt.map((d, i) => d && <path key={i} d={d} fill={CURTAINS[i]} opacity=".85" />)}
        {props && <path d={props} fill="#8a4a2e" opacity=".55" />}
      </g>
      {mull && <path d={mull} stroke={darker} strokeWidth="1.6" opacity=".75" />}
      {sill && <path d={sill} fill={light} />}
      {balc && <path d={balc} fill="none" stroke={dark} strokeWidth="2" />}
      {snow && sillSnow && <g className="snow-cap"><path d={sillSnow} fill={SNOW} /></g>}

      {/* крыши */}
      {roof === 'pitched' && (
        <g>
          <path d={`M${x - 8} ${top} L${x + w * 0.5} ${top - 46} L${x + w + 8} ${top} Z`} fill={mixHex('#8a463a', hazeColor, haze)} />
          <path d={`M${x - 8} ${top} L${x + w * 0.5} ${top - 46} L${x + w + 8} ${top} Z`} fill="url(#shade-x)" />
          {detail >= 1 && <path d={Array.from({ length: Math.floor(w / 14) }, (_, k) => `M${x + k * 14 + 6} ${top}L${x + w * 0.5} ${top - 46}`).join('')} stroke={INK} strokeOpacity=".12" />}
        </g>
      )}
      {roof === 'mansard' && (
        <g>
          <path d={`M${x - 4} ${top} L${x + 16} ${top - 34} L${x + w - 16} ${top - 34} L${x + w + 4} ${top} Z`} fill={mixHex('#4e5a62', hazeColor, haze)} />
          <path d={`M${x - 4} ${top} L${x + 16} ${top - 34} L${x + w - 16} ${top - 34} L${x + w + 4} ${top} Z`} fill="url(#shade-y)" />
          {detail >= 1 && Array.from({ length: Math.max(1, Math.floor(w / 80)) }, (_, k) => {
            const dx = x + 30 + k * ((w - 60) / Math.max(1, Math.floor(w / 80) - 0.0001))
            return (
              <g key={k}>
                <path d={`M${dx - 9} ${top - 4} V${top - 22} L${dx} ${top - 30} L${dx + 9} ${top - 22} V${top - 4} Z`} fill={mixHex(base, '#3a3a4a', 0.3)} />
                <rect x={dx - 5} y={top - 20} width="10" height="13" fill={glassC} />
                <rect x={dx - 5} y={top - 20} width="10" height="13" fill="#ffc070" className="win-lit" opacity={rng() < 0.5 ? 1 : 0} />
              </g>
            )
          })}
        </g>
      )}
      {roof === 'tower' && (
        <g>
          <rect x={x + w * 0.3} y={top - 50} width={w * 0.4} height="50" fill={base} />
          <rect x={x + w * 0.3} y={top - 50} width={w * 0.4} height="50" fill="url(#shade-x)" />
          <path d={`M${x + w * 0.28} ${top - 50} L${x + w / 2} ${top - 112} L${x + w * 0.72} ${top - 50} Z`} fill={mixHex('#4e7a6a', hazeColor, haze)} />
          <path d={`M${x + w / 2} ${top - 112} L${x + w * 0.72} ${top - 50} L${x + w / 2} ${top - 50} Z`} fill={INK} opacity=".18" />
        </g>
      )}
      {roof === 'flat' && detail >= 1 && (
        <g>
          {/* парапет, вентиляция, антенна */}
          <rect x={x + w * 0.15} y={top - 14} width="12" height="14" fill={dark} />
          <path d={`M${x + w * 0.7} ${top} V${top - 30} M${x + w * 0.7 - 8} ${top - 24} H${x + w * 0.7 + 8} M${x + w * 0.7 - 5} ${top - 18} H${x + w * 0.7 + 5}`} stroke={darker} strokeWidth="1.5" />
        </g>
      )}
      {snow && roof !== 'tower' && (
        <g className="snow-cap">
          {roof === 'pitched' ? (
            <path d={`M${x - 8} ${top} L${x + w / 2} ${top - 46} L${x + w + 8} ${top} L${x + w + 8} ${top + 4} Q${x + w / 2} ${top - 34} ${x - 8} ${top + 4} Z`} fill={SNOW} opacity=".95" />
          ) : roof === 'mansard' ? (
            <path d={`M${x + 12} ${top - 34} L${x + w - 12} ${top - 34} L${x + w - 6} ${top - 26} Q${x + w / 2} ${top - 30} ${x + 6} ${top - 26} Z`} fill={SNOW} />
          ) : (
            <rect x={x - 3} y={top - 6} width={w + 6} height="8" rx="4" fill={SNOW} />
          )}
        </g>
      )}

      {/* первый этаж: витрины, маркизы, вывески */}
      {shopfront && (
        <g>
          <rect x={x} y={y - shopH} width={w} height={shopH} fill={darker} />
          <rect x={x} y={y - shopH} width={w} height={shopH} fill="url(#tex-grain)" opacity=".4" />
          <rect x={x} y={y - 8} width={w} height="8" fill={mixHex('#6a6470', base, 0.2)} />
          {Array.from({ length: shopBays }, (_, i) => {
            const bx = x + i * bayW
            const sign = SIGNS[(seed + i * 3) % SIGNS.length]
            const awn = AWN_COLS[(seed + i) % AWN_COLS.length]
            const door = (seed + i) % 3 === 0
            const gx = bx + 8
            const gw = bayW - 16
            const gy = y - shopH + 24
            const gh = shopH - 32
            return (
              <g key={i}>
                {/* витрина: тёплый интерьер + полки + отражение улицы */}
                <rect x={gx} y={gy} width={gw} height={gh} fill="#2a2234" />
                <rect x={gx} y={gy} width={gw} height={gh} fill="url(#shop-warm)" className="shop-lit" />
                {detail >= 2 && (
                  <g opacity=".55">
                    <path d={`M${gx + 4} ${gy + gh * 0.45}h${gw - 8}M${gx + 4} ${gy + gh * 0.75}h${gw - 8}`} stroke="#5a3a2a" strokeWidth="2" />
                    {Array.from({ length: Math.floor(gw / 14) }, (_, k) => (
                      <rect key={k} x={gx + 6 + k * 14} y={gy + gh * (k % 2 ? 0.3 : 0.6)} width="8" height={gh * 0.14} rx="1.5" fill={CURTAINS[(k + i) % CURTAINS.length]} />
                    ))}
                  </g>
                )}
                {door && <rect x={gx + gw - 24} y={gy - 6} width="22" height={gh + 6} fill="#3a2a2a" opacity=".55" />}
                <path d={`M${gx} ${gy} L${gx + gw * 0.45} ${gy} L${gx + gw * 0.15} ${gy + gh} L${gx} ${gy + gh} Z`} fill="#dfe8f6" opacity=".14" />
                <rect x={gx} y={gy} width={gw} height={gh} fill="none" stroke="#1e1a24" strokeWidth="2.5" />
                {/* маркиза */}
                {detail >= 1 && (
                  <g>
                    <path d={`M${bx + 4} ${y - shopH + 14} L${bx + bayW - 4} ${y - shopH + 14} L${bx + bayW + 4} ${y - shopH + 30} L${bx - 4} ${y - shopH + 30} Z`} fill={awn} />
                    <path d={`M${bx + 4} ${y - shopH + 14} L${bx + bayW - 4} ${y - shopH + 14} L${bx + bayW + 4} ${y - shopH + 30} L${bx - 4} ${y - shopH + 30} Z`} fill="url(#pat-stripes)" opacity=".35" />
                    <path d={`M${bx - 4} ${y - shopH + 30} L${bx + bayW + 4} ${y - shopH + 30}`} stroke={INK} strokeOpacity=".3" strokeWidth="2" />
                    <rect x={bx - 4} y={y - shopH + 30} width={bayW + 8} height="8" fill="url(#ao-down)" />
                    <g className="snow-cap"><path d={`M${bx + 4} ${y - shopH + 13} L${bx + bayW - 4} ${y - shopH + 13} L${bx + bayW} ${y - shopH + 18} L${bx} ${y - shopH + 18} Z`} fill={SNOW} /></g>
                  </g>
                )}
                {/* вывеска */}
                {signs && detail >= 1 && (
                  <g>
                    <rect x={bx + bayW * 0.18} y={y - shopH - 6} width={bayW * 0.64} height="18" rx="2" fill={SIGN_COLS[(seed + i) % SIGN_COLS.length]} />
                    <text x={bx + bayW / 2} y={y - shopH + 7.5} fontSize="11" textAnchor="middle" fill="#f6e6c4" fontFamily="Unbounded, sans-serif" fontWeight="500" letterSpacing="1.5">{sign}</text>
                    <text x={bx + bayW / 2} y={y - shopH + 7.5} fontSize="11" textAnchor="middle" fill="#ffd27a" fontFamily="Unbounded, sans-serif" fontWeight="500" letterSpacing="1.5" className="lamp-lit">{sign}</text>
                  </g>
                )}
              </g>
            )
          })}
        </g>
      )}
      {/* основание: тень у земли (ambient occlusion) */}
      <rect x={x} y={y - 22} width={w} height="22" fill="url(#ao-up)" opacity=".6" />
    </g>
  )
})

// ═════════════════════ Небо ═════════════════════

/** Живописные облака: тень снизу, тело, подсвеченный верх. Цвета следуют небу (CSS color-mix). */
export function Clouds({ count, y = 60, scale = 1, width = 1600, seed = 42 }: { count: number; y?: number; scale?: number; width?: number; seed?: number }) {
  const rng = mulberry32(seed)
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const cx = (i + 0.3 + rng() * 0.5) * (width / count)
        const cy = y + rng() * 170
        const s = (0.7 + rng() * 0.9) * scale
        const lobes = Array.from({ length: 5 }, (_, k) => ({ x: (k - 2) * 38 + (rng() - 0.5) * 20, y: -rng() * 26 - (k === 2 ? 14 : 0), r: 26 + rng() * 22 }))
        const body = lobes.map((l) => blob(l.x, l.y, l.r, rng, 8, 0.6)).join(' ')
        const hi = lobes.map((l) => blob(l.x - 6, l.y - l.r * 0.35, l.r * 0.6, rng, 7, 0.6)).join(' ')
        return (
          <g key={i} transform={`translate(${cx.toFixed(0)} ${cy.toFixed(0)}) scale(${s.toFixed(2)})`}>
            <ellipse cx="0" cy="16" rx="128" ry="14" className="cloud-shade" opacity=".7" />
            <path d={body} className="cloud-body" />
            <path d={body} fill="url(#ao-up)" opacity=".35" />
            <path d={hi} className="cloud-hi" opacity=".85" />
          </g>
        )
      })}
    </g>
  )
}

export function Stars({ count = 80 }: { count?: number }) {
  const rng = mulberry32(7)
  let d = ''
  let big = ''
  for (let i = 0; i < count; i++) {
    const cx = rng() * 1600
    const cy = rng() * 400
    const r = 0.5 + rng() * 1.1
    const s = `M${(cx - r).toFixed(1)} ${cy.toFixed(1)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0`
    if (r > 1.35) big += s
    else d += s
  }
  return (
    <g className="stars">
      <path d={d} fill="#fff7e0" opacity=".75" />
      <path d={big} fill="#fffaf0" className="twinkle" style={{ ['--tw' as string]: '4s' }} />
    </g>
  )
}

/** Лужи: отражают небо (градиент неба наоборот) и свет; рябь — только при дожде. Видимость задаёт --wet. */
export function Puddles({ items }: { items: { x: number; y: number; w: number }[] }) {
  const rng = mulberry32(99)
  return (
    <g className="wet-sheen">
      {items.map((p, i) => {
        const d = blob(p.x, p.y, p.w, rng, 10, 1)
        return (
          <g key={i} transform={`translate(${p.x} ${p.y}) scale(1 0.16) translate(${-p.x} ${-p.y})`}>
            <path d={d} fill="#2c3048" opacity=".55" />
            <path d={d} fill="url(#sky-refl)" opacity=".75" />
            <path d={d} fill="url(#tex-streak)" opacity=".3" />
          </g>
        )
      })}
      <g className="rain-o">
        {items.map((p, i) => (
          <ellipse key={i} cx={p.x + ((i * 37) % 30) - 15} cy={p.y} rx={p.w * 0.3} ry={p.w * 0.045} fill="none" stroke="#e8f0ff" strokeWidth=".9" opacity=".5" style={{ animation: `ripple 1.6s ${i * 0.4}s infinite`, transformBox: 'fill-box', transformOrigin: 'center' }} />
        ))}
      </g>
    </g>
  )
}

export function SnowDrift({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g className="snow-cap">
      <path d={`M${x - w} ${y} Q${x - w * 0.6} ${y - 26} ${x - w * 0.1} ${y - 30} Q${x + w * 0.5} ${y - 38} ${x + w} ${y} Z`} fill={SNOW} />
      <path d={`M${x - w} ${y} Q${x - w * 0.6} ${y - 26} ${x - w * 0.1} ${y - 30} Q${x + w * 0.5} ${y - 38} ${x + w} ${y} Z`} fill="url(#ao-up)" opacity=".25" />
      <path d={`M${x - w * 0.5} ${y - 18} Q${x} ${y - 32} ${x + w * 0.5} ${y - 22}`} fill="none" stroke="#fff" strokeWidth="3" opacity=".7" />
      <path d={`M${x - w * 0.8} ${y - 4} Q${x - w * 0.2} ${y - 14} ${x + w * 0.6} ${y - 6}`} fill="none" stroke={SNOW_SH} strokeWidth="2" />
    </g>
  )
}

/** Следы на снегу вдоль тропы (видимы только при снежном покрове). */
export function Footprints({ x0, x1, y, seed = 5 }: { x0: number; x1: number; y: number; seed?: number }) {
  const rng = mulberry32(seed)
  let d = ''
  for (let x = x0; x < x1; x += 22 + rng() * 6) {
    const yy = y + (Math.floor(x / 22) % 2 ? 4 : -2) + (rng() - 0.5) * 2
    d += `M${x.toFixed(0)} ${yy.toFixed(1)}a4.5 1.6 0 1 0 9 0a4.5 1.6 0 1 0 -9 0`
  }
  return <g className="snow-cap"><path d={d} fill={SNOW_SH} opacity=".85" /></g>
}

export function FallenLeaves({ x0, x1, y, seed = 3, h = 70 }: { x0: number; x1: number; y: number; seed?: number; h?: number }) {
  const rng = mulberry32(seed)
  const cols = ['#d07a32', '#b8522a', '#e2a842', '#a03e2a']
  const ds = cols.map(() => '')
  for (let i = 0; i < 70; i++) {
    const cx = x0 + rng() * (x1 - x0)
    const cy = y + rng() * h
    const rx = 3.4 + rng() * 2.6
    const ry = 1.6 + rng() * 1.2
    ds[i % 4] += `M${(cx - rx).toFixed(1)} ${cy.toFixed(1)}q${rx.toFixed(1)} ${(-ry * 2).toFixed(1)} ${(rx * 2).toFixed(1)} 0q${(-rx).toFixed(1)} ${(ry * 2).toFixed(1)} ${(-rx * 2).toFixed(1)} 0`
  }
  return <g>{ds.map((d, i) => <path key={i} d={d} fill={cols[i]} opacity=".9" />)}</g>
}
