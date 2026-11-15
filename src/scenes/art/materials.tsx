/**
 * Материалы и общие defs сцен (Style Guide «Premium cinematic 2.5D diorama»).
 *
 * Правило производительности: живые SVG-фильтры (feTurbulence/feGaussianBlur) НЕ кладём в анимируемые слои —
 * весь <svg> перерисовывается при любой CSS-анимации внутри. Фактура делается растровыми тайлами:
 * SVG-фильтр внутри data-URI <image> браузер растеризует один раз и дальше просто копирует пиксели.
 */

const enc = (s: string) => `data:image/svg+xml,${encodeURIComponent(s)}`

/** Тайл шума: alpha-шум заданного цвета. freq — частота, alpha — плотность. */
export function noiseTile({ size = 256, freq = 0.8, octaves = 2, color = '0 0 0', alpha = 0.5, seed = 3, stretch = 1 }: {
  size?: number; freq?: number; octaves?: number; color?: string; alpha?: number; seed?: number; stretch?: number
}) {
  const [r, g, b] = color.split(' ').map(Number)
  const bf = stretch === 1 ? `${freq}` : `${freq} ${freq * stretch}`
  return enc(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n' x='0' y='0' width='100%' height='100%'>` +
      `<feTurbulence type='fractalNoise' baseFrequency='${bf}' numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/>` +
      `<feColorMatrix values='0 0 0 0 ${r / 255} 0 0 0 0 ${g / 255} 0 0 0 0 ${b / 255} 0 0 0 ${alpha * 2.2} ${-alpha * 0.9}'/></filter>` +
      `<rect width='100%' height='100%' filter='url(#n)'/></svg>`,
  )
}

// Тайлы фактур (строки — вычисляются один раз при импорте модуля)
export const TEX = {
  /** мелкое зерно для штукатурки/бетона */
  grain: noiseTile({ size: 220, freq: 0.9, octaves: 2, color: '30 20 40', alpha: 0.42, seed: 5 }),
  /** светлое зерно (блики фактуры) */
  grainLight: noiseTile({ size: 220, freq: 0.75, octaves: 2, color: '255 245 230', alpha: 0.4, seed: 9 }),
  /** крупные пятна — «мазки» hand-painted, неравномерность покраски стен */
  blotch: noiseTile({ size: 512, freq: 0.012, octaves: 3, color: '40 25 50', alpha: 0.5, seed: 21 }),
  blotchLight: noiseTile({ size: 512, freq: 0.014, octaves: 3, color: '255 240 220', alpha: 0.45, seed: 33 }),
  /** асфальт: средний шум */
  asphalt: noiseTile({ size: 256, freq: 0.55, octaves: 3, color: '15 12 25', alpha: 0.55, seed: 13 }),
  /** горизонтально вытянутые мазки (вода, мокрые отражения, ткань) */
  streak: noiseTile({ size: 512, freq: 0.004, octaves: 2, color: '255 255 255', alpha: 0.5, seed: 7, stretch: 60 }),
  /** листва: средне-мелкие пятна */
  foliage: noiseTile({ size: 256, freq: 0.08, octaves: 3, color: '10 30 10', alpha: 0.55, seed: 17 }),
}

/** Паттерн из растрового тайла. */
function TexPattern({ id, href, size }: { id: string; href: string; size: number }) {
  return (
    <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
      <image href={href} width={size} height={size} />
    </pattern>
  )
}

/** Металлический градиент (по горизонтали — для вертикальных труб/поручней). */
function Metal({ id, vertical = false, tones }: { id: string; vertical?: boolean; tones: string[] }) {
  const n = tones.length - 1
  return (
    <linearGradient id={id} x1="0" y1="0" x2={vertical ? 0 : 1} y2={vertical ? 1 : 0}>
      {tones.map((c, i) => <stop key={i} offset={i / n} stopColor={c} />)}
    </linearGradient>
  )
}

const CHROME = ['#5a5e6c', '#9da3b3', '#eef1f7', '#c3c8d4', '#6e7382', '#8a8fa0', '#d9dde6']
const BRUSHED = ['#8b8f9b', '#c5c9d2', '#e5e7ec', '#b4b8c2', '#9095a1']

/**
 * Единый набор defs для всех слоёв сцены. Рендерится ОДИН раз (в SceneShell), слои ссылаются по id.
 */
export function SharedDefs() {
  return (
    <defs>
      {/* ── небо и атмосфера ── */}
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="sky-top" />
        <stop offset="0.55" className="sky-mid" />
        <stop offset="1" className="sky-bot" />
      </linearGradient>
      <linearGradient id="sky-refl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="sky-bot" />
        <stop offset="0.6" className="sky-mid" />
        <stop offset="1" className="sky-top" />
      </linearGradient>
      <linearGradient id="atmo" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="sky-mid" stopOpacity="0" />
        <stop offset="0.7" className="sky-bot" stopOpacity=".55" />
        <stop offset="1" className="sky-bot" stopOpacity=".8" />
      </linearGradient>
      <linearGradient id="headlight" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff4c4" stopOpacity=".55" />
        <stop offset="1" stopColor="#fff4c4" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="glow-warm">
        <stop offset="0" stopColor="#ffd9a0" stopOpacity=".9" />
        <stop offset="0.35" stopColor="#ffb870" stopOpacity=".35" />
        <stop offset="1" stopColor="#ffb870" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="glow-soft">
        <stop offset="0" stopColor="#ffe6c0" stopOpacity=".55" />
        <stop offset="0.5" stopColor="#ffc890" stopOpacity=".18" />
        <stop offset="1" stopColor="#ffc890" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="glow-cool">
        <stop offset="0" stopColor="#d6f0ff" stopOpacity=".9" />
        <stop offset="0.4" stopColor="#9ad8ff" stopOpacity=".3" />
        <stop offset="1" stopColor="#7ec8ff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="glow-white">
        <stop offset="0" stopColor="#fbfdff" stopOpacity=".95" />
        <stop offset="0.3" stopColor="#eaf2ff" stopOpacity=".4" />
        <stop offset="1" stopColor="#eaf2ff" stopOpacity="0" />
      </radialGradient>
      {/* сигналы светофора: мягкий ореол без жёсткого края */}
      <radialGradient id="glow-red">
        <stop offset="0" stopColor="#ff4a3a" stopOpacity=".75" />
        <stop offset=".35" stopColor="#ff4a3a" stopOpacity=".28" />
        <stop offset="1" stopColor="#ff4a3a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="glow-amber">
        <stop offset="0" stopColor="#ffc22a" stopOpacity=".75" />
        <stop offset=".35" stopColor="#ffc22a" stopOpacity=".28" />
        <stop offset="1" stopColor="#ffc22a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="glow-green">
        <stop offset="0" stopColor="#36e07e" stopOpacity=".75" />
        <stop offset=".35" stopColor="#36e07e" stopOpacity=".28" />
        <stop offset="1" stopColor="#36e07e" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="sun-g">
        <stop offset="0" stopColor="#fffbe6" />
        <stop offset="0.25" stopColor="#ffe9a8" />
        <stop offset="1" stopColor="#ffd08a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="haze-g">
        <stop offset="0" stopColor="#fff0e0" stopOpacity=".5" />
        <stop offset="1" stopColor="#fff0e0" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="cone-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffcf8a" stopOpacity=".34" />
        <stop offset="0.7" stopColor="#ffcf8a" stopOpacity=".08" />
        <stop offset="1" stopColor="#ffcf8a" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="cone-cool" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f2f6ff" stopOpacity=".42" />
        <stop offset="1" stopColor="#f2f6ff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="fade-bottom" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#fff" stopOpacity=".55" />
      </linearGradient>

      {/* ── объём: универсальные оверлеи формы (накладываются поверх локального цвета) ── */}
      <linearGradient id="shade-x" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff4e2" stopOpacity=".22" />
        <stop offset=".38" stopColor="#fff4e2" stopOpacity="0" />
        <stop offset=".7" stopColor="#140c28" stopOpacity=".08" />
        <stop offset="1" stopColor="#140c28" stopOpacity=".42" />
      </linearGradient>
      <linearGradient id="shade-y" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff4e2" stopOpacity=".2" />
        <stop offset=".45" stopColor="#fff4e2" stopOpacity="0" />
        <stop offset="1" stopColor="#140c28" stopOpacity=".38" />
      </linearGradient>
      <linearGradient id="ao-up" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#140c28" stopOpacity="0" />
        <stop offset="1" stopColor="#140c28" stopOpacity=".55" />
      </linearGradient>
      <linearGradient id="ao-down" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#140c28" stopOpacity=".5" />
        <stop offset="1" stopColor="#140c28" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="facade-light" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff2dc" stopOpacity=".16" />
        <stop offset=".5" stopColor="#fff2dc" stopOpacity="0" />
        <stop offset="1" stopColor="#1a1030" stopOpacity=".3" />
      </linearGradient>
      <radialGradient id="contact">
        <stop offset="0" stopColor="#0e0818" stopOpacity=".55" />
        <stop offset=".55" stopColor="#0e0818" stopOpacity=".22" />
        <stop offset="1" stopColor="#0e0818" stopOpacity="0" />
      </radialGradient>

      {/* ── металл ── */}
      <Metal id="metal-v" tones={CHROME} />
      <Metal id="metal-h" vertical tones={CHROME} />
      <Metal id="brushed-v" tones={BRUSHED} />
      <Metal id="brushed-h" vertical tones={BRUSHED} />
      <Metal id="dark-metal-v" tones={['#1e1c26', '#4a4858', '#7c7a8c', '#3a3846', '#24222c']} />
      <Metal id="brass-v" tones={['#7a5a2a', '#c99a4a', '#f4dc98', '#b8863a', '#6a4a20']} />
      <Metal id="yellow-rail" tones={['#9a7410', '#e8b820', '#ffe680', '#d9a818', '#8a6608']} />

      {/* ── стекло ── */}
      <linearGradient id="glass-day" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stopColor="#dfeaf4" stopOpacity=".95" />
        <stop offset=".35" stopColor="#9fb8d0" stopOpacity=".9" />
        <stop offset=".36" stopColor="#7d93ad" stopOpacity=".92" />
        <stop offset="1" stopColor="#3c4660" stopOpacity=".95" />
      </linearGradient>
      <linearGradient id="glass-dark" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stopColor="#4a5470" />
        <stop offset=".5" stopColor="#262c42" />
        <stop offset="1" stopColor="#151a2a" />
      </linearGradient>
      <linearGradient id="glass-streak" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset=".5" stopColor="#fff" stopOpacity=".5" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="win-warm" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe2a8" />
        <stop offset=".6" stopColor="#ffc574" />
        <stop offset="1" stopColor="#e89650" />
      </linearGradient>
      <linearGradient id="win-cool" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e6f2ff" />
        <stop offset="1" stopColor="#a8c6ea" />
      </linearGradient>
      <linearGradient id="shop-warm" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff0c8" />
        <stop offset=".5" stopColor="#ffd08a" />
        <stop offset="1" stopColor="#c9804a" />
      </linearGradient>

      {/* ── мокрые отражения ── */}
      <linearGradient id="refl-warm" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffd090" stopOpacity=".55" />
        <stop offset="1" stopColor="#ffd090" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="refl-cool" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#cfe4ff" stopOpacity=".45" />
        <stop offset="1" stopColor="#cfe4ff" stopOpacity="0" />
      </linearGradient>

      {/* ── фактуры (растровые тайлы) ── */}
      <TexPattern id="tex-grain" href={TEX.grain} size={220} />
      <TexPattern id="tex-grain-light" href={TEX.grainLight} size={220} />
      <TexPattern id="tex-blotch" href={TEX.blotch} size={512} />
      <TexPattern id="tex-blotch-light" href={TEX.blotchLight} size={512} />
      <TexPattern id="tex-asphalt" href={TEX.asphalt} size={256} />
      <TexPattern id="tex-streak" href={TEX.streak} size={512} />
      <TexPattern id="tex-foliage" href={TEX.foliage} size={256} />

      {/* ── векторные паттерны материалов ── */}
      <pattern id="pat-brick" width="64" height="28" patternUnits="userSpaceOnUse">
        <rect width="64" height="28" fill="#000" fillOpacity=".16" />
        <rect x="1" y="1" width="30" height="12" rx="1.5" fill="#fff" fillOpacity=".06" />
        <rect x="33" y="1" width="30" height="12" rx="1.5" fill="#000" fillOpacity=".05" />
        <rect x="-15" y="15" width="30" height="12" rx="1.5" fill="#000" fillOpacity=".04" />
        <rect x="17" y="15" width="30" height="12" rx="1.5" fill="#fff" fillOpacity=".08" />
        <rect x="49" y="15" width="30" height="12" rx="1.5" fill="#fff" fillOpacity=".03" />
      </pattern>
      <pattern id="pat-planks" width="180" height="22" patternUnits="userSpaceOnUse">
        <rect width="180" height="22" fill="#000" fillOpacity=".02" />
        <rect y="20.5" width="180" height="1.5" fill="#000" fillOpacity=".28" />
        <rect x="118" width="1.5" height="22" fill="#000" fillOpacity=".22" />
        <path d="M6 7 Q50 4 96 8 M20 14 Q70 11 110 15 M128 9 Q150 6 176 10" stroke="#000" strokeOpacity=".07" fill="none" />
      </pattern>
      <pattern id="pat-tiles" width="60" height="30" patternUnits="userSpaceOnUse">
        <rect width="60" height="30" fill="none" stroke="#000" strokeOpacity=".14" strokeWidth="1.2" />
        <rect x="2" y="2" width="26" height="12" fill="#fff" fillOpacity=".05" />
      </pattern>
      <pattern id="pat-rubber" width="18" height="8" patternUnits="userSpaceOnUse">
        <rect y="5" width="18" height="2" rx="1" fill="#000" fillOpacity=".2" />
        <rect y="4" width="18" height="1" fill="#fff" fillOpacity=".06" />
      </pattern>
      <pattern id="pat-moquette" width="10" height="10" patternUnits="userSpaceOnUse">
        <circle cx="2.5" cy="2.5" r="1.1" fill="#fff" fillOpacity=".13" />
        <circle cx="7.5" cy="7.5" r="1.1" fill="#000" fillOpacity=".16" />
        <path d="M0 10 L10 0" stroke="#fff" strokeOpacity=".04" />
      </pattern>
      <pattern id="pat-paving" width="46" height="18" patternUnits="userSpaceOnUse">
        <rect x=".5" y=".5" width="45" height="17" rx="2" fill="none" stroke="#000" strokeOpacity=".13" />
        <rect x="2" y="2" width="20" height="6" fill="#fff" fillOpacity=".05" />
      </pattern>
      <pattern id="pat-grille" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="4" fill="#000" fillOpacity=".35" />
      </pattern>
      <pattern id="pat-stripes" width="36" height="20" patternUnits="userSpaceOnUse">
        <rect width="18" height="20" fill="#fff" fillOpacity=".55" />
      </pattern>
    </defs>
  )
}

/** Наложение фактуры на прямоугольник (зерно + мазки). Ничего не анимирует. */
export function Texture({ x, y, w, h, grain = 0.35, blotch = 0.35, light = 0 }: { x: number; y: number; w: number; h: number; grain?: number; blotch?: number; light?: number }) {
  return (
    <g pointerEvents="none">
      {blotch > 0 && <rect x={x} y={y} width={w} height={h} fill="url(#tex-blotch)" opacity={blotch} />}
      {light > 0 && <rect x={x} y={y} width={w} height={h} fill="url(#tex-blotch-light)" opacity={light} />}
      {grain > 0 && <rect x={x} y={y} width={w} height={h} fill="url(#tex-grain)" opacity={grain} />}
    </g>
  )
}

/** Мягкая контактная тень под объектом. */
export function Contact({ cx, cy, rx, ry, o = 1 }: { cx: number; cy: number; rx: number; ry: number; o?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#contact)" opacity={o} />
}
