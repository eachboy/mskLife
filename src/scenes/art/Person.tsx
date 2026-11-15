import { memo, type CSSProperties, type ReactNode } from 'react'
import type { CharacterLook } from '../../simulation/engine/CharacterStateManager'
import { mixHex } from '../../utils/math'

/**
 * Персонаж: стилизованная, но анатомически правдоподобная фигура (~7 голов).
 * Система координат: стопы на y=0, лицом к +x, рост ≈ 150 ед. Сидя таз на y=-46 (высота сиденья -44).
 * Конечности двухсегментные: бедро→голень, плечо→предплечье. Ходьба — CSS-анимация вращений
 * (колено сгибается в фазе переноса) + опускание таза в фазе двойной опоры, чтобы стопы не висели над землёй.
 */
export type PersonPose = 'walk' | 'stand' | 'sit' | 'phone' | 'drink' | 'read' | 'type' | 'wait' | 'hold' | 'doze' | 'window' | 'listen' | 'pole'

export type HairStyle = 'short' | 'long' | 'bob' | 'bun' | 'cap' | 'pony' | 'curly' | 'spiky' | 'buzz' | 'bald'

export interface PersonPalette {
  skin: string
  hair: string
  hairStyle: HairStyle
  coat: string
  pants: string
  shoes: string
  accent: string
  glasses?: boolean
  earring?: boolean
  /** наушники — только у части прохожих */
  phones?: boolean
  build?: 'slim' | 'avg' | 'broad' | 'heavy'
  age?: 'young' | 'adult' | 'elder'
  /** верхняя одежда, если по погоде нужна куртка/пальто */
  outer?: 'coat' | 'puffer' | 'parka' | 'trench' | 'bomber'
  /** одежда под верхней (или единственная в тепло) */
  top?: 'hoodie' | 'sweater' | 'shirt' | 'tee'
  topColor?: string
  bottom?: 'pants' | 'jeans' | 'skirt'
  beard?: boolean
}

const SKINS = ['#f3d2b8', '#ebc1a0', '#deaa86', '#c58c66', '#f7dcc7', '#a8714f']
const HAIRS = ['#2a1d1a', '#47302a', '#6e4630', '#b98450', '#1d1c26', '#7a3530', '#d6c296', '#3a3346']
const ELDER_HAIRS = ['#cfcac2', '#a9a49c', '#e4e0d8', '#8f8a84']
const COATS = ['#b4473e', '#3e8a88', '#c99a3e', '#4f5ea8', '#7a5390', '#c97a90', '#5a7a4c', '#c8b48e', '#34507a', '#a85434', '#6c94c0', '#8e6c50', '#3c3a44', '#7c8a90']
const TOPS = ['#e8dcc8', '#c7563f', '#41607e', '#8a9a6c', '#d8b25a', '#6a4c72', '#ececec', '#3a3a46', '#b98a6e']
const PANTS = ['#2b3044', '#39364c', '#4a4038', '#4f6386', '#26252f', '#665646', '#5d6a7c']
const STYLES: HairStyle[] = ['short', 'long', 'bob', 'bun', 'cap', 'pony', 'curly', 'spiky', 'short', 'long', 'buzz']

export function randomPalette(rng: () => number): PersonPalette {
  const p = <T,>(a: readonly T[]) => a[Math.floor(rng() * a.length)]
  const ageR = rng()
  const age: PersonPalette['age'] = ageR < 0.38 ? 'young' : ageR < 0.82 ? 'adult' : 'elder'
  const elder = age === 'elder'
  const style: HairStyle = elder ? p(['short', 'bun', 'bald', 'bob', 'short'] as const) : p(STYLES)
  const bR = rng()
  const build: PersonPalette['build'] = bR < 0.3 ? 'slim' : bR < 0.72 ? 'avg' : bR < 0.9 ? 'broad' : 'heavy'
  const longHair = style === 'long' || style === 'bob' || style === 'bun' || style === 'pony'
  return {
    skin: p(SKINS),
    hair: elder ? p(ELDER_HAIRS) : p(HAIRS),
    hairStyle: style,
    coat: p(COATS),
    pants: p(PANTS),
    shoes: rng() < 0.45 ? '#ece4d6' : rng() < 0.5 ? '#2a2430' : '#5a4232',
    accent: p(COATS),
    glasses: rng() < (elder ? 0.6 : 0.22),
    earring: longHair && rng() < 0.3,
    phones: !elder && rng() < 0.22,
    build,
    age,
    outer: p(['coat', 'puffer', 'parka', 'trench', 'bomber', 'coat'] as const),
    top: p(['hoodie', 'sweater', 'shirt', 'tee'] as const),
    topColor: p(TOPS),
    bottom: longHair && rng() < 0.35 ? 'skirt' : rng() < 0.5 ? 'jeans' : 'pants',
    beard: !longHair && style !== 'cap' && rng() < 0.25,
  }
}

/** Главный герой — узнаваемый образ: бирюзовое пальто, розовые наушники, бордовый шарф, каре. */
export const HERO: PersonPalette = {
  skin: '#f3d2b8', hair: '#2b2030', hairStyle: 'bob', coat: '#2f8a8c', pants: '#2b3044', shoes: '#ece4d6', accent: '#b23a52',
  build: 'slim', age: 'young', outer: 'coat', top: 'sweater', topColor: '#e8dcc8', bottom: 'jeans',
}

interface Props {
  pose: PersonPose
  facing?: 1 | -1
  palette: PersonPalette
  look?: Partial<CharacterLook>
  headphones?: boolean
  bag?: 'none' | 'backpack' | 'tote' | 'cross'
  cup?: boolean
  stride?: number
  scale?: number
  hero?: boolean
  /** сидит (любая поза рук: phone/drink/listen…) */
  seated?: boolean
  /** 'front' — сидит лицом к камере (диваны вдоль стены вагона/автобуса) */
  view?: 'side' | 'front'
}

// ── константы скелета ──
const HIP = -76
const KNEE = -39
const SH = -121
const NECK = -125
/** исходная точка шеи в координатах рисунка головы (голова масштабируется вокруг неё) */
const HEAD_NECK = -121
const HEAD_K = 0.88
const HIP_SIT = -46
const UA = 27
const FA = 25
const INK = '#1a1428'
const CREAM = '#fff3e2'

const rad = (a: number) => (a * Math.PI) / 180
/** конец сегмента длины L, повёрнутого на a (0 — вниз, отрицательный — вперёд) */
const seg = (x: number, y: number, a: number, L: number): [number, number] => [x - L * Math.sin(rad(a)), y + L * Math.cos(rad(a))]

const BUILD = { slim: 0.9, avg: 1, broad: 1.13, heavy: 1.18 } as const

/** [плечо, предплечье] ближней и дальней руки; tilt — наклон головы */
type ArmPose = { near: [number, number]; far: [number, number]; tilt: number; prop?: 'phone' | 'cup' | 'book' | 'none' }
const POSES: Record<Exclude<PersonPose, 'walk'>, ArmPose> = {
  stand: { near: [5, -12], far: [-3, -14], tilt: 0 },
  window: { near: [4, -10], far: [-2, -12], tilt: -5 },
  listen: { near: [8, -30], far: [6, -28], tilt: 4 },
  wait: { near: [9, -38], far: [7, -34], tilt: 0 },
  phone: { near: [-12, -108], far: [5, -16], tilt: 12, prop: 'phone' },
  drink: { near: [-14, -116], far: [4, -14], tilt: 0, prop: 'cup' },
  read: { near: [-24, -76], far: [-20, -80], tilt: 14, prop: 'book' },
  type: { near: [-38, -50], far: [-34, -54], tilt: 6 },
  hold: { near: [-176, -4], far: [6, -14], tilt: 0 },
  pole: { near: [-58, -62], far: [6, -16], tilt: 0 },
  sit: { near: [-16, -60], far: [-12, -62], tilt: 0 },
  doze: { near: [-14, -62], far: [-10, -64], tilt: 20 },
}

const SIT_POSES = new Set<PersonPose>(['sit', 'read', 'type', 'doze'])

// ─────────── части тела ───────────

function Shoe({ x, c }: { x: number; c: string }) {
  const sole = mixHex(c, '#ffffff', 0.35)
  return (
    <g>
      <path d={`M${x - 5} -9 Q${x - 6.5} -1.5 ${x - 4.5} 0 L${x + 11} 0 Q${x + 13.5} -0.5 ${x + 12} -3.8 Q${x + 8} -7.6 ${x + 3} -9 Z`} fill={c} />
      <path d={`M${x - 4.8} -0.9 L${x + 11.8} -0.9`} stroke={sole} strokeWidth="1.6" opacity=".8" />
      <path d={`M${x - 2} -7 Q${x + 3} -8 ${x + 6} -6`} stroke="#fff" strokeWidth=".8" opacity=".25" fill="none" />
    </g>
  )
}

/** Нога: бедро и голень — отдельные группы; walk=a|b — анимация, иначе статичные углы. */
function Leg({ x, hipY, col, shoe, width, walk, thigh = 0, shin = 0, sit }: {
  x: number; hipY: number; col: string; shoe: string; width: number; walk?: 'a' | 'b'; thigh?: number; shin?: number; sit?: boolean
}) {
  if (sit) {
    // сидя: бедро горизонтально вперёд, голень вниз к полу
    const kx = x + 35
    return (
      <g>
        <path d={`M${x} ${hipY} L${kx} ${hipY - 1}`} stroke={col} strokeWidth={width + 1.5} strokeLinecap="round" />
        <path d={`M${kx} ${hipY - 1} L${kx + 1} -6`} stroke={col} strokeWidth={width - 1.5} strokeLinecap="round" />
        <path d={`M${x + 4} ${hipY + 4} Q${x + 18} ${hipY + 6} ${kx - 2} ${hipY + 4}`} stroke={INK} strokeOpacity=".22" strokeWidth="2" fill="none" />
        <Shoe x={kx + 1} c={shoe} />
      </g>
    )
  }
  const kneeY = KNEE + (hipY - HIP)
  const thighStyle: CSSProperties | undefined = walk
    ? { transformOrigin: `${x}px ${hipY}px`, animation: `w-thigh var(--stride) ease-in-out infinite`, animationDelay: walk === 'b' ? 'calc(var(--stride) * -0.5)' : undefined }
    : undefined
  const shinStyle: CSSProperties | undefined = walk
    ? { transformOrigin: `${x}px ${kneeY}px`, animation: `w-shin var(--stride) linear infinite`, animationDelay: walk === 'b' ? 'calc(var(--stride) * -0.5)' : undefined }
    : undefined
  return (
    <g style={thighStyle} transform={walk ? undefined : `rotate(${thigh} ${x} ${hipY})`}>
      <path d={`M${x} ${hipY} L${x} ${kneeY}`} stroke={col} strokeWidth={width + 1.5} strokeLinecap="round" />
      <g style={shinStyle} transform={walk ? undefined : `rotate(${shin} ${x} ${kneeY})`}>
        <path d={`M${x} ${kneeY} L${x} -6`} stroke={col} strokeWidth={width - 1} strokeLinecap="round" />
        <path d={`M${x + width * 0.25} ${kneeY + 4} L${x + width * 0.25} -10`} stroke="#fff" strokeOpacity=".08" strokeWidth={width * 0.35} />
        <Shoe x={x} c={shoe} />
      </g>
    </g>
  )
}

/** Рука: плечо + предплечье + кисть (+предмет, который остаётся вертикальным). */
function Arm({ x, y, col, skin, a, b, walk, prop, width }: {
  x: number; y: number; col: string; skin: string; a: number; b: number; walk?: 'near' | 'far'; prop?: ReactNode; width: number
}) {
  const [ex, ey] = [x, y + UA]
  const upperStyle: CSSProperties | undefined = walk
    ? { transformOrigin: `${x}px ${y}px`, animation: 'w-arm var(--stride) ease-in-out infinite', animationDelay: walk === 'far' ? 'calc(var(--stride) * -0.5)' : undefined }
    : undefined
  const foreStyle: CSSProperties | undefined = walk
    ? { transformOrigin: `${ex}px ${ey}px`, animation: 'w-fore var(--stride) ease-in-out infinite', animationDelay: walk === 'far' ? 'calc(var(--stride) * -0.5)' : undefined }
    : undefined
  return (
    <g style={upperStyle} transform={walk ? undefined : `rotate(${a} ${x} ${y})`}>
      <path d={`M${x} ${y} L${ex} ${ey}`} stroke={col} strokeWidth={width} strokeLinecap="round" />
      <g style={foreStyle} transform={walk ? undefined : `rotate(${b} ${ex} ${ey})`}>
        <path d={`M${ex} ${ey} L${ex} ${ey + FA - 2}`} stroke={col} strokeWidth={width - 1} strokeLinecap="round" />
        {/* манжета */}
        <path d={`M${ex - width / 2 + 0.5} ${ey + FA - 4} L${ex + width / 2 - 0.5} ${ey + FA - 4}`} stroke={INK} strokeOpacity=".25" strokeWidth="1.4" />
        <ellipse cx={ex} cy={ey + FA + 1.5} rx="3.3" ry="3.9" fill={skin} />
        {prop && <g transform={`translate(${ex} ${ey + FA + 1.5}) rotate(${walk ? 0 : -(a + b)})`}>{prop}</g>}
      </g>
    </g>
  )
}

function torsoPath(bw: number, heavy: boolean, hemY: number, flare: number) {
  const S = 14.2 * bw
  const W = (heavy ? 15 : 11.6) * bw
  const H = 12.8 * bw
  return (
    `M${-S + 3} ${SH - 3} Q0 ${SH - 6.5} ${S - 3} ${SH - 3} Q${S + 1.6} ${SH - 1} ${S + 0.6} ${SH + 8} ` +
    `Q${W + (heavy ? 5 : 1.5)} ${-96} ${H + flare} ${hemY} Q0 ${hemY + 2.6} ${-H - flare} ${hemY} ` +
    `Q${-W - 1.5} ${-96} ${-S - 0.6} ${SH + 8} Q${-S - 1.6} ${SH - 1} ${-S + 3} ${SH - 3} Z`
  )
}

function Hair({ p, front }: { p: PersonPalette; front: boolean }) {
  const h = p.hair
  const hl = mixHex(h, '#fff1dc', 0.3)
  const st = p.hairStyle
  if (!front) {
    // волосы позади головы
    if (st === 'long') return <path d="M-7 -143 Q-15 -127 -11.5 -104 Q-6 -101.5 -1 -106 Q-4.5 -121 -2.5 -133 Z" fill={h} />
    if (st === 'bob') return <path d="M-8 -143 Q-13 -128 -9.5 -121.5 Q-4 -120 0 -123 Q-2.5 -131 -1.5 -138 Z" fill={h} />
    if (st === 'pony') return <path d="M-7.5 -143 Q-19 -139 -16 -120 Q-14 -126 -11 -129 Q-9 -131 -7 -134 Z" fill={h} />
    if (st === 'bun') return <circle cx="-7" cy="-147.5" r="5.2" fill={h} />
    if (st === 'curly') return <g fill={h}>{[[-8, -132], [-10, -139], [-7, -145]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="5" />)}</g>
    return null
  }
  if (st === 'bald') return <path d="M-9.4 -138 Q-10.4 -129 -6.5 -126.5 L-4.6 -131.5 Q-7 -134 -6.4 -139.5 Z" fill={h} />
  const cap = 'M-9.6 -133.5 Q-11.4 -149.5 1.5 -150 Q11.6 -150 12.2 -140 Q8.4 -144.6 3.4 -143.8 Q-0.6 -143 -2.8 -139.2 Q-4.6 -136 -5.6 -131 Q-8 -130.6 -9.6 -133.5 Z'
  return (
    <g>
      <path d={cap} fill={h} opacity={st === 'buzz' ? 0.6 : 1} />
      {st === 'bob' && <path d="M-0.5 -146.5 Q8.5 -148 12.4 -138.6 Q8.4 -141.6 3.6 -141.4 Z" fill={h} />}
      {st === 'long' && <path d="M0 -146.5 Q9 -148 12.4 -139 Q7.4 -142 2.8 -142 Z" fill={h} />}
      {st === 'spiky' && <path d="M-7 -146 L-6 -154 L-2 -148.5 L1 -156 L4 -149 L8.5 -154 L9 -146 Z" fill={h} />}
      {st === 'curly' && <g fill={h}>{[[-4, -149], [2, -151], [8, -148.5], [-8.5, -144]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="4.6" />)}</g>}
      {st !== 'buzz' && <path d="M-5 -146.4 Q1.5 -149.6 8 -146.4" stroke={hl} strokeWidth="1.3" fill="none" opacity=".55" strokeLinecap="round" />}
    </g>
  )
}

function Head({ p, look, headphones, hero, tilt, nod }: { p: PersonPalette; look?: Partial<CharacterLook>; headphones?: boolean; hero?: boolean; tilt: number; nod?: 'nod' | 'look' | 'doze' }) {
  const hat = !!look?.hat
  const skinD = mixHex(p.skin, '#7a3a3a', 0.28)
  const brow = mixHex(p.hair, INK, 0.3)
  const cap = p.hairStyle === 'cap'
  const anim: CSSProperties | undefined = nod
    ? { transformOrigin: `1px ${HEAD_NECK}px`, animation: nod === 'nod' ? 'head-nod 0.95s ease-in-out infinite' : nod === 'doze' ? 'head-doze 6s ease-in-out infinite' : 'look-around 9s ease-in-out infinite' }
    : undefined
  return (
    <g transform={`rotate(${tilt} 1 ${NECK}) translate(1 ${NECK}) scale(${HEAD_K}) translate(-1 ${-HEAD_NECK})`}>
      <g style={anim}>
        {!hat && <Hair p={p} front={false} />}
        {/* шея + тень под подбородком */}
        <path d={`M-3.4 ${HEAD_NECK - 7} L4.6 ${HEAD_NECK - 7} L5.2 ${HEAD_NECK + 6} L-4 ${HEAD_NECK + 6} Z`} fill={p.skin} />
        <path d={`M-3.4 ${HEAD_NECK - 6} L4.6 ${HEAD_NECK - 6} L4.8 ${HEAD_NECK - 1} Q0 ${HEAD_NECK + 1} -3.6 ${HEAD_NECK - 1} Z`} fill={skinD} opacity=".55" />
        {/* череп + челюсть */}
        <path d="M-9.4 -136 Q-9.8 -148.6 1.4 -148.6 Q11.8 -148.6 11.6 -137 Q11.8 -131.6 10.6 -128.6 Q8.6 -124.4 3.6 -124 Q-1.6 -124 -5.2 -127 Q-9 -130 -9.4 -136 Z" fill={p.skin} />
        <path d="M-9.4 -136 Q-9 -130 -5.2 -127 Q-1.6 -124 3.6 -124 Q-1 -126.5 -3.6 -131 Q-6 -136 -5.4 -142 Q-9.2 -141 -9.4 -136 Z" fill={skinD} opacity=".3" />
        {/* ухо */}
        <ellipse cx="-2.6" cy="-135" rx="2.2" ry="3.2" fill={skinD} opacity=".85" />
        {/* лицо 3/4 */}
        <g style={{ transformOrigin: '5px -137px', animation: 'blink-eye 5.5s infinite' }}>
          <ellipse cx="7.6" cy="-137" rx="1.15" ry="1.55" fill="#231a2b" />
          <ellipse cx="2.6" cy="-137.1" rx=".95" ry="1.4" fill="#231a2b" />
          <circle cx="8" cy="-137.6" r=".42" fill="#fff" opacity=".85" />
          <path d="M6.2 -138.6 q1.5 -0.9 3 0" stroke="#231a2b" strokeWidth=".7" fill="none" />
        </g>
        <path d="M5.8 -140.6 q2 -1.2 3.9 -0.2 M0.9 -140.5 q1.4 -0.8 2.7 -0.2" stroke={brow} strokeWidth="1.05" fill="none" strokeLinecap="round" />
        <path d="M10.6 -137.4 q1.9 2.7 0.9 3.7 q-0.7 0.4 -1.6 0.1" stroke={skinD} strokeWidth=".95" fill="none" strokeLinecap="round" />
        <path d="M6.9 -130.4 q1.7 0.8 3.2 -0.1" stroke="#8a4448" strokeWidth=".95" fill="none" strokeLinecap="round" />
        <ellipse cx="5" cy="-132.6" rx="2.4" ry="1.4" fill="#e8786e" opacity=".12" />
        {p.beard && <path d="M-4.4 -129 Q-1 -123.6 4 -123.4 Q9.8 -123.8 11 -129.2 Q8.6 -127.2 6.6 -128.4 Q3 -127.6 -0.6 -129.8 Z" fill={p.hair} opacity=".9" />}
        {p.age === 'elder' && <path d="M4.6 -134.2 q1.4 0.8 2.6 0.2 M-1 -139.6 q0.8 -0.3 1.4 0" stroke={skinD} strokeWidth=".6" fill="none" opacity=".7" />}
        {!hat && <Hair p={p} front />}
        {cap && !hat && (
          <g>
            <path d="M-10 -137.6 Q-9.6 -151.4 1.6 -151.4 Q12.4 -151.4 12.4 -140 Z" fill={p.accent} />
            <path d="M8 -141 L19.6 -139.8 Q19.8 -137.8 16.6 -137.8 L8 -138.6 Z" fill={mixHex(p.accent, INK, 0.3)} />
          </g>
        )}
        {hat && (
          <g>
            <path d="M-10.6 -136.8 Q-10.4 -153.4 1.4 -153.4 Q12.8 -153.4 12.4 -138.4 Z" fill={hero ? '#d9a338' : p.accent} />
            <path d="M-10.9 -141.4 Q1 -144.6 12.7 -142.4 L12.6 -137.6 Q1 -139.8 -10.8 -136.6 Z" fill={mixHex(hero ? '#d9a338' : p.accent, INK, 0.22)} />
            <circle cx="1.2" cy="-155" r="3.6" fill={CREAM} />
          </g>
        )}
        {p.glasses && (
          <g stroke="#2a2232" strokeWidth=".95" fill="#dfeaff" fillOpacity=".14">
            <ellipse cx="7.8" cy="-137" rx="3.1" ry="2.6" />
            <ellipse cx="2.4" cy="-137.1" rx="2.4" ry="2.5" />
            <path d="M4.8 -137.4 h0.1 M-0.1 -137.4 L-2.6 -136.4" fill="none" />
          </g>
        )}
        {p.earring && <circle cx="-2.4" cy="-131" r="1.15" fill="#e8c15a" />}
        {headphones && (
          <g>
            <path d="M-4.6 -137 Q-3 -156 4.6 -151.6" stroke="#2a2438" strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <ellipse cx="-3" cy="-135" rx="3.6" ry="5.4" fill={hero ? '#f08aa2' : '#3a3546'} />
            <ellipse cx="-3.8" cy="-136.2" rx="1.2" ry="2.6" fill="#fff" opacity=".25" />
          </g>
        )}
      </g>
    </g>
  )
}

function Outerwear({ p, look, bw, heavy, sitting }: { p: PersonPalette; look?: Partial<CharacterLook>; bw: number; heavy: boolean; sitting: boolean }) {
  const coat = look?.coat ?? 'light'
  const top = p.top ?? 'sweater'
  const topCol = p.topColor ?? p.coat
  const outer = coat === 'light' ? null : coat === 'jacket' ? (p.outer === 'coat' || p.outer === 'trench' || p.outer === 'parka' ? 'bomber' : p.outer ?? 'bomber') : p.outer === 'bomber' ? 'coat' : p.outer ?? 'coat'
  const col = outer ? p.coat : topCol
  const dk = mixHex(col, INK, 0.3)
  const lt = mixHex(col, CREAM, 0.22)
  // длина полы
  let hem = outer === 'coat' || outer === 'trench' ? -34 : outer === 'parka' ? -50 : outer === 'puffer' && coat === 'winter' ? -46 : outer ? -64 : -67
  if (sitting) hem = Math.max(hem, -68)
  const flare = hem > -40 ? 0 : hem > -60 ? 4 : 7
  const d = torsoPath(bw, heavy, hem, flare)
  const S = 14.2 * bw
  return (
    <g>
      {/* капюшон / мех — за шеей */}
      {(outer === 'parka' || (!outer && top === 'hoodie')) && (
        <path d={`M-9 ${SH - 2} Q-14 ${SH - 14} -4 ${SH - 13} Q2 ${SH - 10} 4 ${SH - 3} Z`} fill={outer === 'parka' ? '#d8cbb4' : dk} />
      )}
      <path d={d} fill={col} />
      <path d={d} fill="url(#shade-x)" />
      {/* складки ткани у талии и локтя */}
      <path d={`M${-8 * bw} -98 q3 5 1 11 M${6 * bw} -100 q-2 6 1 12`} stroke={dk} strokeWidth="1.1" opacity=".35" fill="none" strokeLinecap="round" />
      <path d={`M${-S + 4} ${SH - 1.5} Q0 ${SH - 5} ${S - 4} ${SH - 1.5}`} stroke={lt} strokeWidth="1.2" opacity=".5" fill="none" />
      {outer === 'puffer' && [0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${-12 * bw} ${SH + 12 + i * 12} Q0 ${SH + 15 + i * 12} ${12 * bw} ${SH + 12 + i * 12}`} stroke={dk} strokeWidth="1.2" opacity=".4" fill="none" />
      ))}
      {(outer === 'coat' || outer === 'trench' || outer === 'parka') && (
        <g>
          <path d={`M3 ${SH - 3} L4 ${hem + 1}`} stroke={dk} strokeWidth="1.2" opacity=".55" />
          <path d={`M-2 ${SH - 3} L4 ${SH + 13} L9 ${SH - 2}`} fill={topCol} stroke={dk} strokeWidth=".8" strokeOpacity=".4" />
          {[0, 1, 2].map((i) => <circle key={i} cx="6.2" cy={SH + 20 + i * 11} r="1.1" fill={dk} />)}
          {outer === 'trench' && <path d={`M${-12.5 * bw} -90 L${12.5 * bw} -90`} stroke={dk} strokeWidth="2.6" opacity=".6" />}
        </g>
      )}
      {outer === 'bomber' && <path d={`M${-12.6 * bw} ${hem - 2} L${12.6 * bw} ${hem - 2}`} stroke={dk} strokeWidth="3" opacity=".55" />}
      {!outer && top === 'hoodie' && (
        <g>
          <path d={`M-7 -84 Q2 -86 9 -84 L8 -76 Q1 -74 -6 -76 Z`} fill={dk} opacity=".35" />
          <path d={`M2 ${SH - 1} l-1 12 M5 ${SH - 1} l0.5 11`} stroke={CREAM} strokeWidth=".9" opacity=".7" />
        </g>
      )}
      {!outer && top === 'shirt' && <path d={`M-3 ${SH - 3} L2 ${SH + 4} L7 ${SH - 3} M2 ${SH + 4} L2.5 ${hem}`} stroke={dk} strokeWidth="1" fill="none" opacity=".6" />}
      {!outer && top === 'sweater' && <path d={`M${-12.8 * bw} ${hem - 2.5} L${12.8 * bw} ${hem - 2.5}`} stroke={dk} strokeWidth="2.6" opacity=".35" />}
    </g>
  )
}

function Umbrella({ hx, hy }: { hx: number; hy: number }) {
  const top = hy - 74
  return (
    <g>
      <path d={`M${hx} ${hy + 4} L${hx} ${top}`} stroke="#3a3346" strokeWidth="2.2" />
      <path d={`M${hx} ${hy + 4} q0 5 -4.5 5`} stroke="#3a3346" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <g transform={`translate(${hx} ${top})`}>
        <path d="M-50 4 Q-46 -36 0 -40 Q46 -36 50 4 Q38 -4 25 4 Q12 -4 0 4 Q-12 -4 -25 4 Q-38 -4 -50 4 Z" fill="#b8384e" />
        <path d="M-50 4 Q-46 -36 0 -40 Q46 -36 50 4 Q38 -4 25 4 Q12 -4 0 4 Q-12 -4 -25 4 Q-38 -4 -50 4 Z" fill="url(#shade-y)" />
        <path d="M0 -40 Q-14 -18 -25 4 M0 -40 Q14 -18 25 4 M0 -40 L0 4" stroke="#7a2034" strokeWidth=".9" fill="none" opacity=".7" />
        <path d="M-40 -14 Q-28 -32 -6 -36" stroke="#fff" strokeWidth="2" fill="none" opacity=".22" strokeLinecap="round" />
        {/* мокрый блеск купола */}
        <path d="M-30 -26 Q-14 -36 6 -37" stroke="#fff" strokeWidth="1" fill="none" className="wet-sheen" />
        <circle cx="0" cy="-41" r="2" fill="#3a3346" />
      </g>
    </g>
  )
}

const Cup = () => (
  <g>
    <path d="M-4.6 -15 L4.6 -15 L3.6 -1 L-3.6 -1 Z" fill="#efe6d6" />
    <path d="M-4.6 -10 L4.4 -10 L4 -5 L-4.2 -5 Z" fill="#9a6a48" />
    <rect x="-5.4" y="-17" width="10.8" height="2.6" rx="1.2" fill="#3a2a26" />
    <path d="M-4 -14 L-3.2 -2" stroke="#fff" strokeWidth=".9" opacity=".4" />
  </g>
)
const Phone = () => (
  <g transform="rotate(-12)">
    <rect x="-3" y="-13" width="7.5" height="13" rx="1.4" fill="#1d1b26" />
    <rect x="-2.2" y="-12" width="5.9" height="10.6" rx=".8" fill="#9fdcff" opacity=".9" />
    <rect x="-2.2" y="-12" width="5.9" height="4" fill="#fff" opacity=".25" />
  </g>
)
const Book = ({ c }: { c: string }) => (
  <g transform="translate(6 -6) rotate(-10)">
    <path d="M-12 -8 L0 -6 L12 -8 L12 6 L0 8 L-12 6 Z" fill="#f2e6cc" />
    <path d="M0 -6 L0 8" stroke="#b49a72" strokeWidth="1" />
    <path d="M-9 -3 h6 M-9 0 h7 M-9 3 h5 M3 -3 h6 M3 0 h7 M3 3 h5" stroke="#a88c66" strokeWidth=".7" />
    <path d="M-12.5 6.5 L0 8.8 L12.5 6.5" stroke={c} strokeWidth="1.6" fill="none" />
  </g>
)

function Bag({ kind, p, bw }: { kind: 'backpack' | 'tote' | 'cross'; p: PersonPalette; bw: number }) {
  const c = p.accent
  const dk = mixHex(c, INK, 0.35)
  if (kind === 'backpack') {
    return (
      <g>
        <path d={`M${-14 * bw - 9} ${SH + 4} Q${-14 * bw - 11} ${SH + 26} ${-14 * bw - 8} -80 L${-14 * bw + 3} -80 L${-14 * bw + 3} ${SH + 2} Z`} fill={c} />
        <path d={`M${-14 * bw - 9} ${SH + 4} Q${-14 * bw - 11} ${SH + 26} ${-14 * bw - 8} -80 L${-14 * bw + 3} -80 L${-14 * bw + 3} ${SH + 2} Z`} fill="url(#shade-y)" />
        <rect x={-14 * bw - 9} y={-98} width="8" height="12" rx="2" fill={dk} opacity=".6" />
      </g>
    )
  }
  return null
}

function BagFront({ kind, p, bw }: { kind: 'backpack' | 'tote' | 'cross'; p: PersonPalette; bw: number }) {
  const c = kind === 'tote' ? '#e2d2ae' : p.accent
  const dk = mixHex(c, INK, 0.35)
  if (kind === 'backpack') return <path d={`M${-6 * bw} ${SH - 2} Q${-2} ${SH + 12} ${-3} -94`} stroke={dk} strokeWidth="3" fill="none" strokeLinecap="round" />
  if (kind === 'cross') {
    return (
      <g>
        <path d={`M${8 * bw} ${SH - 2} L${-12 * bw} -82`} stroke={dk} strokeWidth="2" />
        <rect x={-18 * bw} y="-86" width="14" height="11" rx="3" fill={c} />
      </g>
    )
  }
  return (
    <g>
      <path d={`M${10 * bw} ${SH - 1} L${12 * bw} -84`} stroke={mixHex(c, INK, 0.4)} strokeWidth="1.6" />
      <path d={`M${7 * bw} -86 L${21 * bw} -86 L${22 * bw} -62 L${6 * bw} -62 Z`} fill={c} />
      <path d={`M${7 * bw} -86 L${21 * bw} -86 L${22 * bw} -62 L${6 * bw} -62 Z`} fill="url(#shade-x)" />
      <path d={`M${9 * bw} -80 h10`} stroke={dk} strokeWidth=".8" opacity=".5" />
    </g>
  )
}

function Person(props: Props) {
  const sitting = SIT_POSES.has(props.pose) || !!props.seated
  if (props.view === 'front' && sitting) return <FrontSitter {...props} />
  return <SidePerson {...props} />
}

function SidePerson({ pose, facing = 1, palette: p, look, headphones, bag = 'none', cup, stride = 0.95, scale = 1, hero, seated }: Props) {
  const walking = pose === 'walk'
  const sitting = SIT_POSES.has(pose) || !!seated
  const bw = BUILD[p.build ?? 'avg']
  const heavy = p.build === 'heavy'
  const elder = p.age === 'elder'
  const base: ArmPose = walking ? { near: [0, 0], far: [0, 0], tilt: 0 } : POSES[pose as Exclude<PersonPose, 'walk'>]
  // сидя дальняя рука лежит на коленях
  const ap: ArmPose = sitting && !SIT_POSES.has(pose) ? { ...base, far: POSES.sit.far } : base
  const upperDy = sitting ? HIP - HIP_SIT : 0
  const legW = (p.bottom === 'skirt' ? 8.6 : 10.6) * (heavy ? 1.12 : bw > 1 ? 1.05 : 1)
  const legCol = p.bottom === 'skirt' ? mixHex(p.pants, INK, 0.25) : p.bottom === 'jeans' ? mixHex(p.pants, '#4a6a9a', 0.45) : p.pants
  const farLeg = mixHex(legCol, INK, 0.28)
  const coatCol = look?.coat && look.coat !== 'light' ? p.coat : p.topColor ?? p.coat
  const sleeve = coatCol
  const sleeveFar = mixHex(sleeve, INK, 0.3)
  const armW = 8.6 * (heavy ? 1.15 : bw)
  const stoop = elder ? 5 : 0
  const strideS = elder ? stride * 1.18 : stride
  const style = { '--stride': `${strideS}s` } as CSSProperties
  const umbrella = !!look?.umbrella && !sitting
  // ближняя рука держит зонт, если он есть
  const nearArm: [number, number] = umbrella ? [-30, -78] : ap.near
  const nearProp = ap.prop === 'phone' ? <Phone /> : ap.prop === 'cup' || (cup && !umbrella && !ap.prop) ? <Cup /> : ap.prop === 'book' ? <Book c={p.accent} /> : undefined
  const shX = 3.5
  const [ex, ey] = seg(shX, SH + 2, nearArm[0], UA)
  const [hx, hy] = seg(ex, ey, nearArm[0] + nearArm[1], FA + 1.5)
  const nod: 'nod' | 'look' | 'doze' | undefined = pose === 'doze' ? 'doze' : (headphones && (pose === 'listen' || pose === 'sit' || pose === 'stand')) ? 'nod' : pose === 'wait' ? 'look' : undefined

  const upper = (
    <g transform={stoop ? `rotate(${stoop} 0 ${HIP})` : undefined}>
      {/* рюкзак за спиной */}
      {bag === 'backpack' && <Bag kind="backpack" p={p} bw={bw} />}
      {/* дальняя рука */}
      <Arm x={-3.5} y={SH + 2} col={sleeveFar} skin={mixHex(p.skin, INK, 0.2)} a={ap.far[0]} b={ap.far[1]} walk={walking ? 'far' : undefined} width={armW} />
      <Outerwear p={p} look={look} bw={bw} heavy={heavy} sitting={sitting} />
      {look?.scarf && (
        <g>
          <path d={`M-6 ${SH - 4} Q1 ${SH - 8} 8 ${SH - 4} L8.5 ${SH + 2} Q1 ${SH - 1} -6.5 ${SH + 2} Z`} fill={p.accent} />
          <path d={`M4 ${SH} L6 ${SH + 22} L10.5 ${SH + 21} L8.5 ${SH}`} fill={mixHex(p.accent, INK, 0.15)} />
          <path d={`M5.5 ${SH + 22} l0.6 3 M7.5 ${SH + 22} l0.6 3 M9.5 ${SH + 21.5} l0.6 3`} stroke={p.accent} strokeWidth="1" />
        </g>
      )}
      {bag !== 'none' && <BagFront kind={bag} p={p} bw={bw} />}
      <Head p={p} look={look} headphones={headphones} hero={hero} tilt={ap.tilt} nod={nod} />
      {/* ближняя рука */}
      <Arm x={shX} y={SH + 2} col={sleeve} skin={p.skin} a={nearArm[0]} b={nearArm[1]} walk={walking && !umbrella ? 'near' : undefined} prop={nearProp} width={armW} />
      {umbrella && <Umbrella hx={hx} hy={hy} />}
      {look?.breath && <circle cx="16" cy="-131" r="2.6" fill="#fff" style={{ animation: 'steam 2.6s ease-out infinite' }} />}
    </g>
  )

  const legs = sitting ? (
    <g>
      <Leg x={-3} hipY={HIP_SIT + 1} col={farLeg} shoe={mixHex(p.shoes, INK, 0.25)} width={legW} sit />
      <Leg x={1.5} hipY={HIP_SIT} col={legCol} shoe={p.shoes} width={legW} sit />
      {/* пола пальто на коленях */}
      {look?.coat === 'winter' && (p.outer === 'coat' || p.outer === 'trench' || !p.outer) && (
        <path d={`M${-13 * bw} ${HIP_SIT - 6} L24 ${HIP_SIT - 7} Q29 ${HIP_SIT - 1} 26 ${HIP_SIT + 9} L${-12 * bw} ${HIP_SIT + 9} Z`} fill={p.coat} />
      )}
      {p.bottom === 'skirt' && <path d={`M${-12 * bw} ${HIP_SIT - 6} L22 ${HIP_SIT - 7} L24 ${HIP_SIT + 5} L${-12 * bw} ${HIP_SIT + 6} Z`} fill={p.pants} />}
    </g>
  ) : (
    <g>
      <Leg x={-3} hipY={HIP} col={farLeg} shoe={mixHex(p.shoes, INK, 0.25)} width={legW} walk={walking ? 'b' : undefined} thigh={pose === 'stand' || pose === 'window' ? 4 : 2} shin={1} />
      <Leg x={2.5} hipY={HIP} col={legCol} shoe={p.shoes} width={legW} walk={walking ? 'a' : undefined} thigh={pose === 'wait' ? -5 : -2} shin={pose === 'wait' ? 6 : 2} />
      {p.bottom === 'skirt' && <path d={`M${-12.5 * bw} -76 L${12.5 * bw} -76 L${15 * bw} -48 Q0 -45 ${-15 * bw} -48 Z`} fill={p.pants} />}
    </g>
  )

  return (
    <g transform={`scale(${facing * scale} ${scale})`} style={style}>
      {/* контактная тень: плотное ядро + мягкий ореол */}
      <ellipse cx={sitting ? 12 : 2} cy="0" rx={sitting ? 30 : 22} ry="5" fill="url(#contact)" />
      <g className={walking ? 'walk-bob' : undefined}>
        {legs}
        <g transform={upperDy ? `translate(0 ${upperDy})` : undefined}>
          <g className={walking ? undefined : 'breathe'}>{upper}</g>
        </g>
      </g>
    </g>
  )
}

// ─────────── сидит лицом к камере ───────────

function FrontHair({ p, front }: { p: PersonPalette; front: boolean }) {
  const h = p.hair
  const st = p.hairStyle
  const hl = mixHex(h, '#fff1dc', 0.3)
  if (!front) {
    if (st === 'long') return <path d="M-12 -112 Q-15 -92 -12 -76 L12 -76 Q15 -92 12 -112 Z" fill={h} />
    if (st === 'bob' || st === 'curly') return <path d="M-12.5 -112 Q-14 -98 -11 -94 L11 -94 Q14 -98 12.5 -112 Z" fill={h} />
    if (st === 'bun') return <circle cx="0" cy="-125" r="5.5" fill={h} />
    return null
  }
  if (st === 'bald') return <path d="M-10.6 -108 Q-11 -100 -9 -98 L-8 -106 Z M10.6 -108 Q11 -100 9 -98 L8 -106 Z" fill={h} />
  return (
    <g>
      <path d="M-11 -106 Q-12 -123 0 -123.5 Q12 -123 11 -106 Q9 -114 3 -116 Q-4 -118 -9 -112 Q-10 -110 -11 -106 Z" fill={h} opacity={st === 'buzz' ? 0.6 : 1} />
      {(st === 'bob' || st === 'long') && <path d="M-11 -106 Q-12 -96 -10.5 -94 L-8.6 -106 Z M11 -106 Q12 -96 10.5 -94 L8.6 -106 Z" fill={h} />}
      {st === 'curly' && <g fill={h}>{[[-8, -120], [0, -123], [8, -120], [-11, -112], [11, -112]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="4.4" />)}</g>}
      {st === 'spiky' && <path d="M-8 -119 L-6 -127 L-2 -121 L1 -128 L4 -121 L8 -126 L8 -118 Z" fill={h} />}
      {st === 'cap' && <path d="M-11.4 -110 Q-11 -125 0 -125 Q11 -125 11.4 -110 Z M-9 -110 Q0 -106 9 -110 L11 -107 Q0 -102 -11 -107 Z" fill={p.accent} />}
      {st !== 'buzz' && st !== 'cap' && <path d="M-5 -120 Q0 -122 5 -120" stroke={hl} strokeWidth="1.3" fill="none" opacity=".5" strokeLinecap="round" />}
    </g>
  )
}

/** Фронтальная сидящая фигура: бёдра к камере (ракурс), колени, голени вниз; кисти на коленях/с предметом. */
function FrontSitter({ pose, palette: p, look, headphones, bag = 'none', scale = 1, hero, facing = 1 }: Props) {
  const bw = BUILD[p.build ?? 'avg']
  const heavy = p.build === 'heavy'
  const coatOn = look?.coat && look.coat !== 'light'
  const col = coatOn ? p.coat : p.topColor ?? p.coat
  const dk = mixHex(col, INK, 0.32)
  const legCol = p.bottom === 'skirt' ? mixHex(p.pants, INK, 0.25) : p.bottom === 'jeans' ? mixHex(p.pants, '#4a6a9a', 0.45) : p.pants
  const legD = mixHex(legCol, INK, 0.3)
  const skinD = mixHex(p.skin, '#7a3a3a', 0.28)
  const S = 18.5 * bw
  const W = (heavy ? 18 : 14.5) * bw
  const SHY = -102
  // ноги: колени слегка разведены; ступни на полу
  const knees: [number, number][] = [[-9.5 * bw, -30], [9.5 * bw, -30]]
  const tilt = pose === 'doze' ? 14 : pose === 'read' || pose === 'phone' ? 10 : 0
  const nod = pose === 'doze' ? 'head-doze 6s ease-in-out infinite' : headphones && pose !== 'read' ? 'head-nod 0.95s ease-in-out infinite' : undefined
  const torso = `M${-S + 3} ${SHY - 2} Q0 ${SHY - 6} ${S - 3} ${SHY - 2} Q${S + 2} ${SHY} ${S + 1} ${SHY + 8} Q${W + 2} -64 ${W + 3} -46 L${-W - 3} -46 Q${-W - 2} -64 ${-S - 1} ${SHY + 8} Q${-S - 2} ${SHY} ${-S + 3} ${SHY - 2} Z`
  // руки: плечо → локоть → кисть (на коленях / у груди с телефоном / с книгой)
  const hands: [number, number][] = pose === 'phone' ? [[-3, -76], [4, -78]] : pose === 'read' ? [[-10, -70], [10, -70]] : pose === 'drink' ? [[-8, -50], [7, -84]] : [[-10 * bw, -46], [10 * bw, -46]]
  const elbows: [number, number][] = [[-S - 1, -70], [S + 1, -70]]
  return (
    <g transform={`scale(${facing * scale} ${scale})`}>
      <ellipse cx="0" cy="0" rx="26" ry="6" fill="url(#contact)" />
      <ellipse cx="5" cy="-82" rx={S + 10} ry="44" fill="url(#contact)" opacity=".55" />
      {/* голени и обувь */}
      {knees.map(([kx], i) => (
        <g key={i}>
          <path d={`M${kx} -30 L${kx * 1.12} -6`} stroke={i ? legCol : legD} strokeWidth={11 * (heavy ? 1.1 : 1)} strokeLinecap="round" />
          <path d={`M${kx - 4} -26 L${kx * 1.12 - 3} -18`} stroke={INK} strokeOpacity=".3" strokeWidth="6" strokeLinecap="round" />
          <path d={`M${kx * 1.14 - 6.5} -2 Q${kx * 1.14 - 7} -9 ${kx * 1.14} -9.5 Q${kx * 1.14 + 7} -9 ${kx * 1.14 + 6.5} -2 Q${kx * 1.14} 1 ${kx * 1.14 - 6.5} -2 Z`} fill={i ? p.shoes : mixHex(p.shoes, INK, 0.2)} />
          <path d={`M${kx * 1.14 - 5.5} -1 Q${kx * 1.14} 1 ${kx * 1.14 + 5.5} -1`} stroke="#fff" strokeOpacity=".3" strokeWidth="1.2" fill="none" />
        </g>
      ))}
      {/* бёдра в ракурсе (к камере) */}
      {knees.map(([kx], i) => (
        <g key={i}>
          <path d={`M${kx - 9 * bw} -52 L${kx - 10.5 * bw} -32 Q${kx} -24 ${kx + 10.5 * bw} -32 L${kx + 9 * bw} -52 Z`} fill={i ? legCol : legD} />
          <path d={`M${kx - 9 * bw} -52 L${kx - 9.8 * bw} -40 Q${kx} -36 ${kx + 9.8 * bw} -40 L${kx + 9 * bw} -52 Z`} fill="#fff" opacity=".1" />
          <path d={`M${kx - 6} -31 Q${kx} -27 ${kx + 6} -31`} stroke="#fff" strokeOpacity=".22" strokeWidth="2.2" fill="none" />
        </g>
      ))}
      {p.bottom === 'skirt' && <path d={`M${-W - 4} -50 L${W + 4} -50 L${W + 6} -38 Q0 -35 ${-W - 6} -38 Z`} fill={p.pants} />}
      {look?.coat === 'winter' && (p.outer === 'coat' || p.outer === 'trench') && <path d={`M${-W - 4} -50 L${W + 4} -50 L${W + 5} -34 Q0 -31 ${-W - 5} -34 Z`} fill={p.coat} />}
      {bag === 'backpack' && <rect x={W - 2} y="-60" width="16" height="22" rx="5" fill={p.accent} />}
      <g className="breathe">
        {/* туловище */}
        <path d={torso} fill={col} />
        <path d={torso} fill="url(#shade-x)" opacity=".8" />
        <path d={`M0 ${SHY - 3} L0 -47`} stroke={dk} strokeWidth="1.1" opacity={coatOn ? 0.6 : 0.25} />
        {coatOn && <path d={`M-5 ${SHY - 3} L0 ${SHY + 10} L5 ${SHY - 3}`} fill={p.topColor ?? '#e8dcc8'} stroke={dk} strokeWidth=".8" strokeOpacity=".4" />}
        <path d={`M${-W + 2} -70 q4 4 3 10 M${W - 2} -70 q-4 4 -3 10`} stroke={dk} strokeWidth="1" opacity=".35" fill="none" />
        {look?.scarf && <path d={`M-8 ${SHY - 3} Q0 ${SHY - 7} 8 ${SHY - 3} L8 ${SHY + 3} Q0 ${SHY} -8 ${SHY + 3} Z M2 ${SHY + 2} L3 ${SHY + 22} L8 ${SHY + 22} L7 ${SHY + 2} Z`} fill={p.accent} />}
        {/* руки */}
        {elbows.map(([ex, ey], i) => {
          const [hx2, hy2] = hands[i]
          const sx = i ? S - 2 : -S + 2
          const c = i ? col : mixHex(col, INK, 0.12)
          return (
            <g key={i}>
              <path d={`M${sx} ${SHY + 2} L${ex} ${ey} L${hx2} ${hy2}`} stroke={c} strokeWidth={8.4 * (heavy ? 1.12 : bw)} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <ellipse cx={hx2} cy={hy2 + 1} rx="3.4" ry="3.2" fill={p.skin} />
            </g>
          )
        })}
        {pose === 'phone' && <g><rect x="-3.6" y="-90" width="7.6" height="12" rx="1.4" fill="#1d1b26" /><rect x="-2.8" y="-89" width="6" height="9.8" rx=".8" fill="#9fdcff" opacity=".9" /></g>}
        {pose === 'read' && <g transform="translate(0 -76)"><path d="M-14 -8 L0 -5 L14 -8 L14 6 L0 9 L-14 6 Z" fill="#f2e6cc" /><path d="M0 -5 V9" stroke="#b49a72" /><path d="M-14 6 L0 9 L14 6" stroke={p.accent} strokeWidth="1.6" fill="none" /></g>}
        {pose === 'drink' && <g transform="translate(7 -84)"><Cup /></g>}
        {/* голова анфас */}
        <g transform={`translate(0 -9) rotate(${tilt * 0.4} 0 -98) translate(0 ${tilt * 0.25}) translate(0 -96) scale(.9) translate(0 96)`}>
          <g style={nod ? { transformOrigin: '0px -96px', animation: nod } : undefined}>
            <FrontHair p={p} front={false} />
            <path d="M-4 -100 h8 v12 h-8 Z" fill={p.skin} />
            <path d="M-3.6 -100 h7.2 v3 q-3.6 2 -7.2 0 Z" fill={skinD} opacity=".5" />
            <ellipse cx="-10.6" cy="-108" rx="2.2" ry="3.2" fill={skinD} />
            <ellipse cx="10.6" cy="-108" rx="2.2" ry="3.2" fill={skinD} />
            <path d="M-10.4 -109 Q-10.8 -122 0 -122 Q10.8 -122 10.4 -109 Q10.4 -101 6 -98 Q3 -96 0 -96 Q-3 -96 -6 -98 Q-10.4 -101 -10.4 -109 Z" fill={p.skin} />
            <path d="M-10.4 -109 Q-10.4 -101 -6 -98 Q-3 -96 0 -96 Q-5 -99 -7 -104 Q-8.6 -109 -8 -114 Q-10.2 -113 -10.4 -109 Z" fill={skinD} opacity=".25" />
            <g style={{ transformOrigin: '0px -110px', animation: pose === 'doze' ? undefined : 'blink-eye 6s infinite' }}>
              {pose === 'doze' || pose === 'read' || pose === 'phone'
                ? <path d="M-6.4 -109.4 q2 1.2 3.6 0 M2.8 -109.4 q2 1.2 3.6 0" stroke="#231a2b" strokeWidth={pose === 'doze' ? 1 : 1.3} fill="none" strokeLinecap="round" />
                : <g fill="#231a2b"><ellipse cx="-4.4" cy="-110" rx="1.15" ry="1.5" /><ellipse cx="4.4" cy="-110" rx="1.15" ry="1.5" /></g>}
            </g>
            <path d="M-6.6 -113.6 q2 -1 3.8 -0.2 M2.8 -113.8 q1.8 -0.8 3.8 0.2" stroke={mixHex(p.hair, INK, 0.3)} strokeWidth="1" fill="none" strokeLinecap="round" />
            <path d="M0 -108.6 q1 3 0 4.2 q-0.8 0.3 -1.4 0" stroke={skinD} strokeWidth=".9" fill="none" />
            <path d="M-2.4 -101.6 q2.4 1 4.8 0" stroke="#8a4448" strokeWidth=".95" fill="none" strokeLinecap="round" />
            <ellipse cx="-6" cy="-104.6" rx="2" ry="1.2" fill="#e8786e" opacity=".1" />
            <ellipse cx="6" cy="-104.6" rx="2" ry="1.2" fill="#e8786e" opacity=".1" />
            {p.beard && <path d="M-9.6 -104 Q-8 -96.5 0 -96 Q8 -96.5 9.6 -104 Q6 -100 3 -101 Q0 -100 -3 -101 Q-6 -100 -9.6 -104 Z" fill={p.hair} opacity=".9" />}
            {!look?.hat && <FrontHair p={p} front />}
            {look?.hat && <g><path d="M-11.4 -108 Q-11.6 -127 0 -127 Q11.6 -127 11.4 -108 Z" fill={hero ? '#d9a338' : p.accent} /><path d="M-11.6 -112 Q0 -115 11.6 -112 L11.4 -107 Q0 -110 -11.4 -107 Z" fill={mixHex(hero ? '#d9a338' : p.accent, INK, 0.22)} /></g>}
            {p.glasses && <g stroke="#2a2232" strokeWidth=".9" fill="#dfeaff" fillOpacity=".14"><circle cx="-4.4" cy="-110" r="3" /><circle cx="4.4" cy="-110" r="3" /><path d="M-1.4 -110.4 h2.8" /></g>}
            {headphones && (
              <g>
                <path d="M-11 -110 Q-12 -129 0 -129 Q12 -129 11 -110" stroke="#2a2438" strokeWidth="2.4" fill="none" />
                <ellipse cx="-11.4" cy="-108" rx="3.4" ry="5" fill={hero ? '#f08aa2' : '#3a3546'} />
                <ellipse cx="11.4" cy="-108" rx="3.4" ry="5" fill={hero ? '#f08aa2' : '#3a3546'} />
              </g>
            )}
            {p.earring && <circle cx="-10.4" cy="-104" r="1.1" fill="#e8c15a" />}
          </g>
        </g>
      </g>
    </g>
  )
}

export default memo(Person)
