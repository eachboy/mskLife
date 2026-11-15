import { memo, useMemo, useState } from 'react'
import { LOCATIONS } from '../data/locations'
import { Hero, type HeroPlace } from '../features/characters/Hero'
import { EntityBand, SeatedFolks, useCrowd, type EntityConfig, type HeroLane } from '../features/city/EntityLayer'
import { useWorldStore } from '../stores/worldStore'
import { fmtTime, mulberry32 } from '../utils/math'
import Person, { randomPalette } from './art/Person'
import { Texture } from './art/materials'
import { SceneShell } from './SceneShell'

// ═════════════════════ Данные линий (реальные станции) ═════════════════════

interface LineDef { name: string; no: string; color: string; stations: string[] }
const LINE_DEFS: LineDef[] = [
  { name: 'Сокольническая', no: '1', color: '#d9322a', stations: ['Комсомольская', 'Красные ворота', 'Чистые пруды', 'Лубянка', 'Охотный ряд', 'Библиотека им. Ленина', 'Кропоткинская', 'Парк культуры', 'Фрунзенская', 'Спортивная'] },
  { name: 'Замоскворецкая', no: '2', color: '#2dbe2c', stations: ['Динамо', 'Белорусская', 'Маяковская', 'Тверская', 'Театральная', 'Новокузнецкая', 'Павелецкая', 'Автозаводская'] },
  { name: 'Арбатско-Покровская', no: '3', color: '#0072ba', stations: ['Бауманская', 'Курская', 'Площадь Революции', 'Арбатская', 'Смоленская', 'Киевская', 'Парк Победы'] },
  { name: 'Кольцевая', no: '5', color: '#8d5b2d', stations: ['Курская', 'Таганская', 'Павелецкая', 'Добрынинская', 'Октябрьская', 'Парк культуры', 'Киевская', 'Краснопресненская', 'Белорусская'] },
  { name: 'Калужско-Рижская', no: '6', color: '#f58220', stations: ['ВДНХ', 'Алексеевская', 'Рижская', 'Проспект Мира', 'Сухаревская', 'Тургеневская', 'Китай-город', 'Третьяковская', 'Октябрьская'] },
  { name: 'Калининская', no: '8', color: '#e8b800', stations: ['Новогиреево', 'Перово', 'Шоссе Энтузиастов', 'Авиамоторная', 'Площадь Ильича', 'Марксистская', 'Третьяковская'] },
  { name: 'Большая кольцевая', no: '11', color: '#82c0c0', stations: ['Савёловская', 'Петровский парк', 'ЦСКА', 'Хорошёвская', 'Шелепиха', 'Деловой центр', 'Народное Ополчение'] },
]

/** Линия и соседние станции для целевой станции (по данным локаций). */
function lineFor(station: string) {
  const line = LINE_DEFS.find((l) => l.stations.includes(station)) ?? LINE_DEFS[0]
  const i = Math.max(0, line.stations.indexOf(station))
  return { line, index: i }
}

const useTargetStation = () =>
  useWorldStore((s) => {
    const e = s.event
    // симуляция (planTrip) знает реальную следующую станцию/станцию прибытия
    if (e?.phase === 'metro-arriving' && e.station) return e.station
    if (e?.nextStation) return e.nextStation
    const dest = e?.destination ? LOCATIONS[e.destination]?.nearestMetro : ''
    return dest || (e ? LOCATIONS[e.anchor]?.nearestMetro : '') || 'Охотный ряд'
  })

/** Линия по событию (event.line из графа города) или по таблице станций. */
function useLine(station: string): { line: LineDef; index: number } {
  const ref = useWorldStore((s) => s.event?.line)
  return useMemo(() => {
    const base = lineFor(station)
    if (!ref || ref.mode !== 'metro') return base
    const known = LINE_DEFS.find((l) => l.name === ref.name)
    const line: LineDef = known ?? { name: ref.name, no: ref.id, color: ref.color, stations: base.line.stations.includes(station) ? base.line.stations : [station] }
    return { line, index: Math.max(0, line.stations.indexOf(station)) }
  }, [ref, station])
}

// ═════════════════════ Геометрия вагона ═════════════════════
// Камера у ближнего борта, смотрит на дальний борт. Дальняя стена: потолок y=300 … пол y=652 (≈167 px/м).
const WALL_T = 300
const FLOOR_Y = 652
const WIN_T = 352
const WIN_B = 488
const SEAT_W = 76
const SEAT_S = 1.9
const FEET_SEAT = 668
const DOOR = { x: 690, w: 220, top: 318 }
const DOOR2 = { x: 1484, w: 220, top: 318 }
const SECTIONS = [{ x0: 140, n: 7 }, { x0: 928, n: 7 }]
const WINDOWS: [number, number][] = [[-60, 46], [150, 404], [424, 672], [938, 1192], [1212, 1462]]
const SEAT_X = SECTIONS.flatMap((s) => Array.from({ length: s.n }, (_, i) => s.x0 + SEAT_W / 2 + i * SEAT_W))

const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`

/** Стена дальнего борта с вырезами окон и дверного проёма (evenodd) — за ней отдельный план тоннеля. */
const WALL_D = (() => {
  let d = `M-60 ${WALL_T}H1660V${FLOOR_Y + 2}H-60Z`
  for (const [a, b] of WINDOWS) d += rr(a, WIN_T, b - a, WIN_B - WIN_T, 16)
  for (const dr of [DOOR, DOOR2]) d += `M${dr.x} ${dr.top}H${dr.x + dr.w}V${FLOOR_Y + 2}H${dr.x}Z`
  return d
})()

// ═════════════════════ Вне вагона: тоннель и станция ═════════════════════

/** Тоннель: статичные кабели (параллельны движению — не «бегут») + быстрые огни/рёбра + свет вагона на стене. */
const Tunnel = memo(function Tunnel() {
  const items = Array.from({ length: 14 }, (_, i) => i * 200)
  return (
    <g>
      <rect x="-60" y={WALL_T} width="1720" height={FLOOR_Y - WALL_T + 10} fill="#0a0a10" />
      {/* свет из окон вагона на стене тоннеля */}
      <rect x="-60" y="330" width="1720" height="260" fill="#4a3e44" opacity=".75" />
      <rect x="-60" y="330" width="1720" height="40" fill="url(#ao-down)" opacity=".7" />
      <rect x="-60" y="520" width="1720" height="80" fill="url(#ao-up)" opacity=".7" />
      <rect x="-60" y="330" width="1720" height="190" fill="url(#tex-grain-light)" opacity=".12" />
      {/* кабели: пучки разной толщины */}
      {[384, 391, 398, 406, 446, 452].map((y, i) => (
        <g key={y}>
          <rect x="-60" y={y} width="1720" height={i % 3 === 0 ? 4 : 3} fill={['#1e1a1e', '#2a2226', '#191820'][i % 3]} />
          <rect x="-60" y={y} width="1720" height="1" fill="#8a6e5a" opacity=".35" />
        </g>
      ))}
      <g className="tunnel-o">
        <g className="tunnel-run">
          {items.map((x) => (
            <g key={x}>
              {/* рёбра тюбингов (смазаны движением) */}
              <rect x={x} y={WALL_T} width="34" height={FLOOR_Y - WALL_T} fill="#121117" opacity=".75" />
              <rect x={x + 34} y={WALL_T} width="14" height={FLOOR_Y - WALL_T} fill="#6a5a58" opacity=".25" />
              {/* лампы тоннеля: смазанный тёплый штрих + ореол на стене */}
              <ellipse cx={x + 100} cy="368" rx="90" ry="16" fill="url(#glow-warm)" opacity=".55" />
              <ellipse cx={x + 100} cy="368" rx="80" ry="3" fill="#ffc66a" opacity=".85" />
              <ellipse cx={x + 100} cy="368" rx="30" ry="1.8" fill="#fff2c8" />
              {x % 400 === 0 && <ellipse cx={x + 160} cy="470" rx="60" ry="2" fill="#a8c8ff" opacity=".45" />}
            </g>
          ))}
          {/* светофор раз в период */}
          <g>
            <rect x="1310" y="410" width="10" height="26" rx="3" fill="#121216" />
            <circle cx="1315" cy="416" r="3" fill="#3bd16f" />
            <ellipse cx="1315" cy="416" rx="34" ry="2" fill="#3bd16f" opacity=".5" />
          </g>
        </g>
      </g>
    </g>
  )
})

/** Станция: колонны, арки, люстры, табличка с названием, платформа и ожидающие люди. */
const Station = memo(function Station({ name, line }: { name: string; line: LineDef }) {
  const cols = Array.from({ length: 8 }, (_, i) => -40 + i * 250)
  const rng = mulberry32(name.length * 17)
  const waiting = [180, 560, 820, 1180, 1430].map((x, i) => ({ x, seed: 300 + i * 7 + Math.floor(rng() * 50), pose: (['phone', 'stand', 'wait', 'listen', 'stand'] as const)[i] }))
  return (
    <g className="station-pan">
      <rect x="-200" y={WALL_T} width="2000" height={FLOOR_Y - WALL_T + 10} fill="#d8c8a6" />
      <rect x="-200" y={WALL_T} width="2000" height="120" fill="#c2ad86" />
      <Texture x={-200} y={WALL_T} w={2000} h={360} grain={0.25} blotch={0.4} light={0.3} />
      {/* арки центрального зала с тёплым светом */}
      {cols.map((x) => (
        <g key={x}>
          <path d={`M${x + 34} 560 V430 Q${x + 125} 360 ${x + 216} 430 V560 Z`} fill="#8a6a4a" opacity=".55" />
          <circle cx={x + 125} cy="420" r="16" fill="#fff0c8" />
          <circle cx={x + 125} cy="420" r="70" fill="url(#glow-warm)" opacity=".7" />
        </g>
      ))}
      {cols.map((x) => (
        <g key={`c${x}`}>
          <rect x={x} y={WALL_T} width="34" height="300" fill="#efe4cc" />
          <rect x={x} y={WALL_T} width="34" height="300" fill="url(#shade-x)" />
          <rect x={x - 6} y="404" width="46" height="12" fill="#c9b07e" />
        </g>
      ))}
      {/* табличка станции (настоящая типографика) */}
      {[300, 1050].map((x) => (
        <g key={x} transform={`translate(${x} 364)`}>
          <rect width={name.length * 13 + 66} height="34" rx="4" fill="#1b2a5e" />
          <circle cx="20" cy="17" r="11" fill="#d9322a" />
          <path d="M14 23 V11 L20 18 L26 11 V23" stroke="#fff" strokeWidth="2.4" fill="none" />
          <text x="40" y="23" fontSize="15" fill="#fff" fontFamily="Unbounded, sans-serif" fontWeight="500">{name.toUpperCase()}</text>
          <rect x={name.length * 13 + 46} y="9" width="12" height="16" rx="3" fill={line.color} />
        </g>
      ))}
      {/* платформа */}
      <rect x="-200" y="600" width="2000" height="62" fill="#a39486" />
      <rect x="-200" y="600" width="2000" height="62" fill="url(#pat-tiles)" opacity=".8" />
      <rect x="-200" y="640" width="2000" height="5" fill="#e8c040" />
      <rect x="-200" y="600" width="2000" height="20" fill="url(#ao-down)" opacity=".5" />
      {waiting.map((w) => (
        <g key={w.x} transform={`translate(${w.x} 632) scale(1.35)`}>
          <Person pose={w.pose} palette={randomPalette(mulberry32(w.seed))} look={{ coat: 'jacket' }} headphones={w.pose === 'listen'} facing={w.x > 800 ? -1 : 1} />
        </g>
      ))}
    </g>
  )
})

// ═════════════════════ Внутри вагона ═════════════════════

function SeatRow({ x0, n }: { x0: number; n: number }) {
  const seat = '#38498c'
  const seatL = '#5a6cb0'
  const seatD = '#26326a'
  let backs = ''
  let tops = ''
  let fronts = ''
  let seams = ''
  for (let i = 0; i < n; i++) {
    const c = x0 + SEAT_W / 2 + i * SEAT_W
    const h = SEAT_W / 2 - 2
    backs += `M${c - h} 576V512Q${c - h} 496 ${c - h + 14} 495H${c + h - 14}Q${c + h} 496 ${c + h} 512V576Z`
    tops += `M${c - h - 1} 574Q${c} 566 ${c + h + 1} 574L${c + h + 2} 584Q${c} 579 ${c - h - 2} 584Z`
    fronts += `M${c - h - 2} 584Q${c} 579 ${c + h + 2} 584L${c + h + 1} 600Q${c} 604 ${c - h - 1} 600Z`
    seams += `M${c - h + 6} 540Q${c} 536 ${c + h - 6} 540M${c - h + 4} 512V570M${c + h - 4} 512V570`
  }
  const w = n * SEAT_W
  return (
    <g>
      {/* пластиковый цоколь с решёткой обогрева */}
      <rect x={x0 - 4} y="598" width={w + 8} height={FLOOR_Y - 598} fill="#8d8890" />
      <rect x={x0 + 10} y="612" width={w - 20} height="22" rx="3" fill="url(#pat-grille)" />
      <rect x={x0 - 4} y="598" width={w + 8} height="16" fill="url(#ao-down)" opacity=".8" />
      {/* спинки, сиденья: ткань с фактурой, объём градиентом */}
      <path d={backs} fill={seat} />
      <path d={backs} fill="url(#pat-moquette)" />
      <path d={backs} fill="url(#shade-y)" />
      <path d={seams} stroke={seatD} strokeWidth="1.4" fill="none" opacity=".7" />
      <path d={tops} fill={seatL} />
      <path d={tops} fill="url(#pat-moquette)" />
      <path d={fronts} fill={seatD} />
      {/* боковые подлокотники-перегородки на концах */}
      {[x0 - 6, x0 + w - 4].map((x) => <rect key={x} x={x} y="520" width="10" height="82" rx="4" fill="#b9b4ae" />)}
    </g>
  )
}

/** Дверь: две створки со стёклами и резиновым уплотнителем; на станции разъезжаются (CSS-цикл). */
function DoorLeaves({ x, w, top }: { x: number; w: number; top: number }) {
  const lw = w / 2
  const leaf = (lx: number, cls: string) => (
    <g className={cls}>
      <path d={`M${lx} ${top}h${lw}v${FLOOR_Y - top}h${-lw}Z${rr(lx + 14, 352, lw - 28, 210, 12)}`} fill="#c7c2b8" fillRule="evenodd" />
      <path d={`M${lx} ${top}h${lw}v${FLOOR_Y - top}h${-lw}Z${rr(lx + 14, 352, lw - 28, 210, 12)}`} fill="url(#shade-x)" fillRule="evenodd" opacity=".6" />
      <path d={rr(lx + 14, 352, lw - 28, 210, 12)} fill="#202838" opacity=".22" />
      <path d={rr(lx + 14, 352, lw - 28, 210, 12)} fill="none" stroke="#1d1c22" strokeWidth="5" />
      <path d={`M${lx + 20} 360 L${lx + 50} 360 L${lx + 24} 470 L${lx + 20} 470 Z`} fill="#fff" opacity=".1" />
      <rect x={lx + 14} y="356" width={lw - 28} height="6" fill="#fff" opacity=".18" />
      {/* наклейка «Не прислоняться» */}
      <rect x={lx + 18} y="584" width={lw - 36} height="16" rx="3" fill="#f2efe8" />
      <text x={lx + lw / 2} y="595" fontSize="7" textAnchor="middle" fill="#c8323a" fontFamily="Manrope, sans-serif" fontWeight="800">НЕ ПРИСЛОНЯТЬСЯ</text>
    </g>
  )
  return (
    <g>
      {/* проём: полоса пола и порог */}
      <rect x={x} y={FLOOR_Y - 8} width={w} height="10" fill="#6a6670" />
      {leaf(x, 'door-l')}
      {leaf(x + lw, 'door-r')}
      <rect x={x + lw - 3} y={top} width="6" height={FLOOR_Y - top} fill="#1d1c22" className="door-seal" />
      {/* рамка проёма */}
      <path d={`M${x - 8} ${FLOOR_Y} V${top - 8} H${x + w + 8} V${FLOOR_Y}`} fill="none" stroke="#a8a39b" strokeWidth="10" />
      <path d={`M${x - 3} ${FLOOR_Y} V${top - 3} H${x + w + 3} V${FLOOR_Y}`} fill="none" stroke="#2a2830" strokeWidth="3" />
      {/* индикатор дверей */}
      <circle cx={x + w / 2 - 14} cy={top - 18} r="4" fill="#3a3a42" />
      <circle cx={x + w / 2 - 14} cy={top - 18} r="4" fill="#ff4a4a" className="door-warn" />
      <circle cx={x + w / 2 + 14} cy={top - 18} r="4" fill="#3bd16f" opacity=".85" />
    </g>
  )
}

/** Табло над дверью: «Следующая станция» в пути и «Станция» на остановке (синхронно с циклом). */
const DoorDisplay = memo(function DoorDisplay({ x, station, line }: { x: number; station: string; line: LineDef }) {
  const minutes = useWorldStore((s) => Math.floor(s.minutes))
  return (
    <g transform={`translate(${x} 248)`} data-testid="metro-display">
      <rect x="-4" y="-4" width="228" height="56" rx="6" fill="#2a2a30" />
      <rect width="220" height="48" rx="4" fill="#0c0e18" />
      <circle cx="18" cy="24" r="10" fill={line.color} />
      <text x="18" y="28" fontSize="10" textAnchor="middle" fill="#fff" fontFamily="Manrope, sans-serif" fontWeight="800">{line.no}</text>
      <g className="disp-next">
        <text x="36" y="19" fontSize="9" fill="#9fb4d8" fontFamily="Manrope, sans-serif" fontWeight="600">Следующая станция</text>
        <text x="36" y="37" fontSize="14" fill="#fff6e0" fontFamily="Manrope, sans-serif" fontWeight="800">{station}</text>
      </g>
      <g className="disp-here">
        <text x="36" y="19" fontSize="9" fill="#ffd27a" fontFamily="Manrope, sans-serif" fontWeight="600">Станция</text>
        <text x="36" y="37" fontSize="14" fill="#fff6e0" fontFamily="Manrope, sans-serif" fontWeight="800">{station}</text>
      </g>
      <text x="212" y="17" fontSize="9" textAnchor="end" fill="#ffb27a" fontFamily="Manrope, sans-serif" fontWeight="700" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTime(minutes)}</text>
    </g>
  )
})

/** Схема линии над окнами: реальные соседние станции, следующая выделена. */
function LineMap({ x, w, line, index }: { x: number; w: number; line: LineDef; index: number }) {
  const n = Math.min(6, line.stations.length)
  const start = Math.max(0, Math.min(line.stations.length - n, index - 3))
  const list = line.stations.slice(start, start + n)
  const step = (w - 60) / (n - 1)
  return (
    <g transform={`translate(${x} 306)`}>
      <rect width={w} height="42" rx="3" fill="#f4f1ea" />
      <rect width={w} height="42" rx="3" fill="url(#shade-y)" opacity=".35" />
      <text x="10" y="11" fontSize="7" fill="#6a6a78" fontFamily="Manrope, sans-serif" fontWeight="700">{line.no} · {line.name.toUpperCase()} ЛИНИЯ</text>
      <path d={`M30 19 H${w - 30}`} stroke={line.color} strokeWidth="5" strokeLinecap="round" />
      {list.map((st, i) => {
        const cx = 30 + i * step
        const cur = start + i === index
        return (
          <g key={st}>
 <circle cx={cx} cy="19" r={cur ? 6 : 4.2} fill="#fff" stroke={line.color} strokeWidth={cur ? 3 : 2.4} />
            {cur && <circle cx={cx} cy="19" r="2.4" fill="#c8323a" />}
            <text x={cx} y="33" fontSize={cur ? 7.6 : 6.8} textAnchor="middle" fill={cur ? '#1b1530' : '#4a4a58'} fontFamily="Manrope, sans-serif" fontWeight={cur ? 800 : 600}>{st}</text>
          </g>
        )
      })}
    </g>
  )
}

/** Рекламные/информационные рамки над окнами (собственная графика, без брендов). */
function AdFrame({ x, w, kind }: { x: number; w: number; kind: 0 | 1 | 2 }) {
  const t = [
    { bg: '#2a3a5e', fg: '#ffd27a', title: 'ТРЕТЬЯКОВКА', sub: 'Новая экспозиция · Лаврушинский пер.' },
    { bg: '#f0e2c8', fg: '#8a2f3a', title: 'ЧИТАЙ В МЕТРО', sub: 'Бесплатная электронная библиотека' },
    { bg: '#3e6a5a', fg: '#f4ead2', title: 'КАТОК НА ВДНХ', sub: 'Каждый вечер · Живая музыка' },
  ][kind]
  return (
    <g transform={`translate(${x} 306)`}>
      <rect width={w} height="42" rx="3" fill="#bdb7ac" />
      <rect x="3" y="3" width={w - 6} height="36" rx="2" fill={t.bg} />
      <circle cx={w - 24} cy="21" r="13" fill={t.fg} opacity=".25" />
      <text x="12" y="20" fontSize="11" fill={t.fg} fontFamily="Unbounded, sans-serif" fontWeight="500">{t.title}</text>
      <text x="12" y="32" fontSize="7" fill={t.fg} opacity=".8" fontFamily="Manrope, sans-serif">{t.sub}</text>
      <rect x="3" y="3" width={w - 6} height="10" fill="#fff" opacity=".08" />
    </g>
  )
}

/** Отражения салона в стекле: полоса потолочного света, призрачные силуэты пассажиров ближнего борта. */
function GlassReflections() {
  return (
    <g pointerEvents="none">
      {WINDOWS.map(([a, b], i) => (
        <g key={a}>
          <rect x={a + 6} y={WIN_T + 6} width={b - a - 12} height="7" rx="3" fill="#fff8e8" opacity=".22" />
          <rect x={a + 6} y={WIN_T + 16} width={b - a - 12} height="3" fill="#fff8e8" opacity=".1" />
          {Array.from({ length: Math.max(1, Math.floor((b - a) / 90)) }, (_, k) => {
            // призрачные отражения пассажиров ближнего борта
            const hx = a + 40 + k * 90 + (i % 2) * 20
            return <path key={k} d={`M${hx - 26} ${WIN_B} Q${hx - 26} ${WIN_B - 40} ${hx - 10} ${WIN_B - 46} A14 15 0 1 1 ${hx + 10} ${WIN_B - 46} Q${hx + 26} ${WIN_B - 40} ${hx + 26} ${WIN_B} Z`} fill="#d8e0f4" opacity=".1" />
          })}
          <path d={`M${a + 30} ${WIN_T} L${a + 80} ${WIN_T} L${a + 30} ${WIN_B} L${a - 20} ${WIN_B} Z`} fill="#fff" opacity=".05" />
        </g>
      ))}
    </g>
  )
}

export function MetroRideScene() {
  const event = useWorldStore((s) => s.event)
  const station = useTargetStation()
  const { line, index } = useLine(station)
  // Цикл вагона (64 с: перегон → станция → двери → разгон). Если сцена открылась фазой отправления,
  // цикл стартует с закрытия дверей на станции (86%), а не с середины тоннеля — без скачка картинки.
  const [cycDelay] = useState(() => (event?.phase === 'metro-departure' ? '-55s' : event?.phase === 'metro-arriving' ? '-44s' : '0s'))
  const heroSits = event?.pose !== 'stand' && event?.pose !== 'walk'
  const HERO_SEAT = SEAT_X[5]

  const outside = (
    <g>
      <Tunnel />
      <Station name={station} line={line} />
    </g>
  )

  // сидящие пассажиры (лицом к камере), герой занимает своё место
  const seated = useMemo(
    () => [
      { i: 0, seed: 51, pose: 'sit' as const },
      { i: 1, seed: 4, pose: 'read' as const },
      { i: 3, seed: 23, pose: 'phone' as const },
      { i: 7, seed: 31, pose: 'doze' as const },
      { i: 8, seed: 61, pose: 'sit' as const, headphones: true },
      { i: 10, seed: 15, pose: 'phone' as const },
      { i: 12, seed: 9, pose: 'listen' as const, headphones: true },
    ],
    [],
  )

  const art = (
    <g>
      {/* ── потолок (ближе к камере — выше в кадре): панели, световые полосы, вентиляция ── */}
      <rect x="-60" y="-20" width="1720" height={WALL_T + 24} fill="#dcd6cb" />
      <rect x="-60" y="-20" width="1720" height={WALL_T + 24} fill="url(#shade-y)" opacity=".5" />
      {[40, 110, 196, 252, 284].map((y, i) => <rect key={y} x="-60" y={y} width="1720" height={1.5 + (4 - i) * 0.5} fill="#8f897e" opacity=".35" />)}
      {/* центральный светильник-диффузор */}
      <rect x="-60" y="146" width="1720" height="30" fill="#fbf7ec" />
      <rect x="-60" y="146" width="1720" height="30" fill="url(#pat-grille)" opacity=".08" />
      <rect x="-60" y="174" width="1720" height="4" fill="#a49c8e" />
      {Array.from({ length: 9 }, (_, i) => <rect key={i} x={i * 200 - 30} y="146" width="3" height="30" fill="#c8c0b0" />)}
      {/* дальняя световая полоса у стены */}
      <rect x="-60" y="276" width="1720" height="10" fill="#fdf9ee" />
      <rect x="-60" y="290" width="1720" height="10" fill="#b8b0a2" />
      {/* вентиляционная решётка */}
      <rect x="-60" y="214" width="1720" height="14" fill="url(#pat-grille)" opacity=".5" />
      {/* ближний продольный поручень с ручками и дальний */}
      <rect x="-60" y="62" width="1720" height="14" fill="url(#metal-h)" />
      {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${100 + i * 200} 76 v30 a12 12 0 0 0 24 0 v-30`} fill="none" stroke="#2a2a32" strokeWidth="5" className="strap" style={{ transformOrigin: `${112 + i * 200}px 76px`, animationDelay: `${-i * 0.37}s` }} />)}
      <rect x="-60" y="236" width="1720" height="8" fill="url(#metal-h)" />

      {/* ── дальняя стена с вырезами окон ── */}
      <path d={WALL_D} fill="#d6cfc2" fillRule="evenodd" />
      <path d={WALL_D} fill="url(#tex-blotch)" fillRule="evenodd" opacity=".25" />
      <path d={WALL_D} fill="url(#tex-grain)" fillRule="evenodd" opacity=".25" />
      <rect x="-60" y={WALL_T} width="1720" height="14" fill="url(#ao-down)" opacity=".6" />
      {/* рамы окон: резиновый уплотнитель + хромированная окантовка + форточка */}
      {WINDOWS.map(([a, b]) => (
        <g key={a}>
          <path d={rr(a, WIN_T, b - a, WIN_B - WIN_T, 16)} fill="none" stroke="#1e1d24" strokeWidth="6" />
          <path d={rr(a - 6, WIN_T - 6, b - a + 12, WIN_B - WIN_T + 12, 20)} fill="none" stroke="#efeae0" strokeWidth="3" />
          <rect x={a + 4} y={WIN_T + 34} width={b - a - 8} height="5" fill="#2a2930" />
        </g>
      ))}
      <GlassReflections />
      {/* подоконник */}
      <rect x="-60" y={WIN_B + 6} width="1720" height="8" fill="#ece6da" />
      <rect x="-60" y={WIN_B + 14} width="1720" height="4" fill="#9a9488" opacity=".6" />
      {/* рекламные рамки и схема линии */}
      <AdFrame x={152} w={250} kind={0} />
      <AdFrame x={424} w={248} kind={1} />
      <LineMap x={938} w={524} line={line} index={index} />
      <DoorDisplay x={DOOR.x} station={station} line={line} />
      {/* панель экстренной связи у двери */}
      <g transform="translate(652 420)">
        <rect width="28" height="52" rx="4" fill="#e8e3da" stroke="#9a948a" />
        <circle cx="14" cy="16" r="7" fill="#d9322a" />
        <text x="14" y="18.5" fontSize="5.5" textAnchor="middle" fill="#fff" fontFamily="Manrope, sans-serif" fontWeight="800">SOS</text>
        <path d="M7 32h14M7 37h14M7 42h10" stroke="#6a6a78" strokeWidth="1.2" />
      </g>

      <DoorLeaves {...DOOR} />
      <DoorLeaves {...DOOR2} />
      {SECTIONS.map((s) => <SeatRow key={s.x0} {...s} />)}

      {/* поручни у перегородок (от пола до продольного поручня) */}
      {[SECTIONS[0].x0 + SECTIONS[0].n * SEAT_W + 12, SECTIONS[1].x0 - 16, SECTIONS[1].x0 + SECTIONS[1].n * SEAT_W + 12].map((x) => (
        <g key={x}>
          <rect x={x - 4} y="244" width="9" height={FLOOR_Y - 244} fill="url(#metal-v)" />
          <ellipse cx={x} cy={FLOOR_Y} rx="10" ry="3" fill="#5a5660" />
        </g>
      ))}
      {/* продольный поручень над сиденьями дальнего борта */}
      <rect x="-60" y="342" width="1720" height="6" fill="url(#metal-h)" />
      {[120, 520, 1000, 1400].map((x) => <rect key={x} x={x} y={WALL_T} width="4" height="44" fill="#9a9ea8" />)}

      {/* ── пол: резина с рёбрами, мягкий блеск света ── */}
      <rect x="-60" y={FLOOR_Y} width="1720" height={920 - FLOOR_Y} fill="#5d5760" />
      <rect x="-60" y={FLOOR_Y} width="1720" height={920 - FLOOR_Y} fill="url(#pat-rubber)" />
      <rect x="-60" y={FLOOR_Y} width="1720" height={920 - FLOOR_Y} fill="url(#tex-grain)" opacity=".4" />
      <rect x="-60" y={FLOOR_Y} width="1720" height="40" fill="url(#ao-down)" opacity=".7" />
      <rect x="-60" y="700" width="1720" height="26" fill="#fbf4e4" opacity=".07" />
      {SECTIONS.map((sc) => <rect key={sc.x0} x={sc.x0} y={FLOOR_Y + 2} width={sc.n * SEAT_W} height="34" fill="#38498c" opacity=".14" />)}
      {SECTIONS.map((sc) => <rect key={`r${sc.x0}`} x={sc.x0} y={FLOOR_Y + 2} width={sc.n * SEAT_W} height="34" fill="url(#tex-streak)" opacity=".25" />)}
      <rect x="-60" y="800" width="1720" height="120" fill="url(#ao-up)" opacity=".5" />

      {/* ── пассажиры ── */}
      <SeatedFolks items={seated.map((p) => ({ x: SEAT_X[p.i], y: FEET_SEAT, s: SEAT_S, seed: p.seed, pose: p.pose, seated: true, view: 'front' as const, headphones: p.headphones }))} />
      {/* вещи на свободном сиденье */}
      <g transform={`translate(${SEAT_X[2]} 574)`}>
        <path d="M-20 0 L-18 -26 Q0 -32 18 -26 L20 0 Z" fill="#6a4a3a" />
        <path d="M-20 0 L-18 -26 Q0 -32 18 -26 L20 0 Z" fill="url(#shade-x)" />
        <path d="M-10 -28 Q0 -44 10 -28" stroke="#3a2a22" strokeWidth="3" fill="none" />
      </g>
      {heroSits ? (
        <Hero place={{ x: HERO_SEAT, y: FEET_SEAT, s: SEAT_S, pose: 'sit', indoor: true, view: 'front' }} />
      ) : (
        <SeatedFolks items={[{ x: HERO_SEAT, y: FEET_SEAT, s: SEAT_S, seed: 77, pose: 'sit', seated: true, view: 'front' }]} />
      )}
      {/* стоящий пассажир держится за продольный поручень (рука на y≈320) */}
      {heroSits ? (
 <g transform="translate(1300 712) scale(2.13)"><Person pose="hold" palette={randomPalette(mulberry32(808))} look={{ coat: 'jacket' }} bag="cross" /></g>
      ) : (
        <Hero place={{ x: 1300, y: 712, s: 2.13, pose: 'hold', indoor: true }} />
      )}
      {/* затенение ближнего потолка и пола: свет падает из центра вагона */}
      <rect x="-60" y="-20" width="1720" height="150" fill="url(#ao-down)" opacity=".55" />
      <rect x="-60" y="740" width="1720" height="180" fill="url(#ao-up)" opacity=".8" />
      {/* вертикальная стойка ближе к камере (сильная глубина) */}
      <rect x="444" y="70" width="16" height="860" fill="url(#metal-v)" />
      <rect x="444" y="70" width="16" height="860" fill="url(#ao-up)" opacity=".35" />
    </g>
  )

  const lights = (
    <>
      <rect x="-60" y="120" width="1720" height="90" fill="url(#glow-soft)" style={{ mixBlendMode: 'screen' }} />
      {Array.from({ length: 8 }, (_, i) => <ellipse key={i} cx={i * 220 + 40} cy="160" rx="200" ry="60" fill="url(#glow-white)" opacity=".28" style={{ mixBlendMode: 'screen' }} />)}
      <rect x="-60" y="270" width="1720" height="30" fill="url(#glow-soft)" opacity=".8" style={{ mixBlendMode: 'screen' }} />
      {/* блики на полу от светильников */}
      {Array.from({ length: 6 }, (_, i) => <ellipse key={i} cx={140 + i * 280} cy="720" rx="150" ry="16" fill="url(#glow-white)" opacity=".18" style={{ mixBlendMode: 'screen' }} />)}
      {/* свет платформы через окна и двери на остановке */}
      <g className="station-light">
        <rect x="-60" y={WALL_T} width="1720" height="420" fill="url(#glow-warm)" opacity=".35" style={{ mixBlendMode: 'screen' }} />
      </g>
    </>
  )
  const bloom = (
    <>
      <rect x="-60" y="148" width="1720" height="26" fill="#fffbe9" />
      <rect x="-60" y="276" width="1720" height="9" fill="#fffbe9" />
      <g className="tunnel-o"><g className="tunnel-run">{Array.from({ length: 14 }, (_, i) => <ellipse key={i} cx={i * 200 + 100} cy="362" rx="40" ry="3" fill="#ffd27a" />)}</g></g>
    </>
  )
  return (
    <div className="absolute inset-0" style={{ ['--cyc-delay' as string]: cycDelay }} data-testid="metro-ride" data-phase={event?.phase ?? 'metro-ride'}>
      <SceneShell back={outside} art={art} lights={lights} bloom={bloom} depths={{ back: 0, art: 0 }} artClassName="car-rock" />
    </div>
  )
}

// ═════════════════════ Станция (платформа) ═════════════════════

/** Поезд «Москва» (сбоку): серебристо-синий кузов, тонированные окна, тёплый салон, двери. */
function TrainSide() {
  return (
    <g>
      {[0, 1, 2, 3].map((c) => (
        <g key={c} transform={`translate(${-100 + c * 560} 0)`}>
          <rect x="0" y="392" width="548" height="250" rx="22" fill="#b9c2d0" />
          <rect x="0" y="392" width="548" height="250" rx="22" fill="url(#shade-y)" />
          <rect x="0" y="560" width="548" height="44" fill="#2c3a62" />
          <rect x="0" y="598" width="548" height="8" fill="#c8323a" />
          <rect x="0" y="400" width="548" height="12" rx="6" fill="#e5e9ef" />
          {[0, 1, 2].map((d) => (
            <g key={d}>
              <rect x={34 + d * 178} y="420" width="104" height="176" rx="6" fill="#3a4258" />
              <g className="train-door" style={{ transformOrigin: `${86 + d * 178}px 500px` }}>
                <rect x={38 + d * 178} y="424" width="96" height="168" rx="4" fill="#ffe0a0" />
                <rect x={38 + d * 178} y="424" width="96" height="168" rx="4" fill="url(#glow-warm)" opacity=".5" />
              </g>
              <path d={rr(146 + d * 178, 432, 26, 90, 6)} fill="#ffe8b8" opacity=".9" />
            </g>
          ))}
          <rect x="546" y="410" width="12" height="210" fill="#2a2e3a" />
        </g>
      ))}
    </g>
  )
}

/** Центр двери вагона: состав из 4 вагонов (−100 + c·560), по 3 двери (34 + d·178, ширина 104). */
const doorX = (car: number, d: number) => -100 + car * 560 + 86 + d * 178
const BOARD_DOOR = doorX(1, 1)

type TrainMode = 'loop' | 'none' | 'arrive' | 'stand' | 'leave'
function trainModeFor(phase: string | undefined): TrainMode {
  switch (phase) {
    case 'metro-platform-wait':
    case 'metro-vestibule':
    case 'metro-turnstile':
    case 'metro-escalator-down':
    case 'metro-transfer':
      return 'none'
    case 'metro-train-arrival':
    case 'metro-boarding':
      return 'arrive'
    case 'metro-alighting':
      return 'stand'
    case 'metro-escalator-up':
    case 'metro-exit':
      return 'leave'
    default:
      return 'loop'
  }
}

export function MetroStationScene() {
  const event = useWorldStore((s) => s.event)
  const eventKey = useWorldStore((s) => s.eventKey)
  const station = event?.station ?? (event ? LOCATIONS[event.anchor].nearestMetro || 'Охотный ряд' : 'Охотный ряд')
  const { line } = useLine(station)
  const phase = event?.phase
  const trainMode = trainModeFor(phase)
  const doorsOpen = phase === 'metro-boarding' || phase === 'metro-alighting'

  const cfg: EntityConfig = useMemo(
    () => ({ id: 'metro-station', pedestrians: 0.9, traffic: 0, pedLanes: [{ y: 752, s: 0.98 }, { y: 772, s: 1.04 }], vehLanes: [], vehicles: [] }),
    [],
  )
  const place: HeroPlace = useMemo(() => {
    const dur = Math.max(4, event?.duration ?? 8)
    // ждёт у края платформы; на прибытии поезда — стоит и смотрит на поезд
    if (phase === 'metro-platform-wait' || phase === 'metro-train-arrival') {
      return { x: BOARD_DOOR + 70, y: 760, s: 1.1, indoor: true, facing: -1, pose: phase === 'metro-train-arrival' ? 'stand' : event?.pose === 'phone' ? 'phone' : 'wait' }
    }
    // посадка: несколько шагов к двери вагона; выход: от двери по платформе
    if (phase === 'metro-boarding') return { x0: BOARD_DOOR + 70, x1: BOARD_DOOR, y: 760, s: 1.1, indoor: true }
    if (phase === 'metro-alighting') return { x0: BOARD_DOOR, x1: BOARD_DOOR + Math.min(500, 70 * dur), y: 760, s: 1.1, indoor: true }
    const dir: 1 | -1 = event?.kind === 'metro-up' ? 1 : eventKey % 2 ? 1 : -1
    const len = Math.min(1250, 85 * dur)
    return dir > 0 ? { x0: 160, x1: 160 + len, y: 786, s: 1.1, indoor: true } : { x0: 1440, x1: 1440 - len, y: 786, s: 1.1, indoor: true }
  }, [event, eventKey, phase])
  const heroLane: HeroLane | null = useMemo(
    () => (place.x0 !== undefined && place.x1 !== undefined ? { x0: place.x0, x1: place.x1, y: place.y, dur: Math.max(4, event?.duration ?? 8), key: eventKey } : null),
    [place, event, eventKey],
  )
  const crowd = useCrowd(cfg, heroLane)
  const cols = [0, 1, 2, 3, 4, 5]

  const back = (
    <g>
      {/* свод: кессоны и арки, мрамор */}
      <rect x="-60" y="-20" width="1720" height="940" fill="#cdbb98" />
      <rect x="-60" y="-20" width="1720" height="150" fill="#a8946e" />
      <Texture x={-60} y={-20} w={1720} h={700} grain={0.3} blotch={0.45} light={0.3} />
      {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${-60 + i * 200} 0 L${-60 + i * 200 + 30} 120 M${-60 + i * 200} 120 H${140 + i * 200}`} stroke="#8a7656" strokeWidth="2" opacity=".5" />)}
      {Array.from({ length: 7 }, (_, i) => (
        <g key={i}>
          <path d={`M${-90 + i * 280} 190 A140 130 0 0 1 ${190 + i * 280} 190 V420 H${-90 + i * 280}Z`} fill="#e6d8b6" />
          <path d={`M${-90 + i * 280} 190 A140 130 0 0 1 ${190 + i * 280} 190 V420 H${-90 + i * 280}Z`} fill="url(#shade-y)" opacity=".5" />
        </g>
      ))}
      {cols.map((i) => (
        <g key={i}>
          <rect x={185 + i * 280} y="150" width="30" height="520" fill="#f1e6c8" />
          <rect x={185 + i * 280} y="150" width="30" height="520" fill="url(#shade-x)" />
          <rect x={177 + i * 280} y="150" width="46" height="14" fill="#c9b07e" />
          <rect x={177 + i * 280} y="650" width="46" height="20" fill="#b8a070" />
        </g>
      ))}
      <StationBoard station={station} line={line} />
      {[1, 3, 5].map((i) => (
        <g key={i}>
          <rect x={90 + i * 280} y="448" width="190" height="42" rx="6" fill="#1b2a5e" />
          <circle cx={112 + i * 280} cy="469" r="13" fill="#d9322a" />
          <path d={`M${105 + i * 280} 476 V462 L${112 + i * 280} 470 L${119 + i * 280} 462 V476`} stroke="#fff" strokeWidth="3" fill="none" />
          <text x={132 + i * 280} y="476" fontSize="17" fill="#fff" fontFamily="Unbounded, sans-serif" fontWeight="500">{station.toUpperCase().slice(0, 14)}</text>
        </g>
      ))}
      {/* люстры */}
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i}>
          <line x1={100 + i * 190} y1="40" x2={100 + i * 190} y2="70" stroke="#5a4a32" strokeWidth="2" />
          <path d={`M${76 + i * 190} 74 Q${100 + i * 190} 104 ${124 + i * 190} 74 Z`} fill="#c9a050" />
          <ellipse cx={100 + i * 190} cy="86" rx="20" ry="9" fill="#fff4d8" />
        </g>
      ))}
    </g>
  )

  // посадка/выход: герой «уходит в вагон» (вверх, в глубину) / «появляется из двери»
  const heroWrap = phase === 'metro-boarding' ? 'board-in' : phase === 'metro-alighting' ? 'board-out' : ''
  const heroDur = `${Math.max(2.5, event?.duration ?? 4)}s`
  const art = (
    <>
      {/* тоннельная стена за путём (видна, пока поезда нет) */}
      <rect x="-60" y="392" width="1720" height="250" fill="#3a3430" />
      <rect x="-60" y="392" width="1720" height="250" fill="url(#tex-blotch)" opacity=".5" />
      <rect x="-60" y="392" width="1720" height="40" fill="url(#ao-down)" opacity=".8" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x={-40 + i * 220} y="470" width="180" height="8" fill="#1e1a1a" opacity=".6" />)}
      {/* путевая стена: кабели и таблички с названием станции (видны, пока нет поезда) */}
      {[512, 520, 530].map((y) => <rect key={y} x="-60" y={y} width="1720" height="3" fill="#1a1618" opacity=".8" />)}
      {[160, 900].map((x) => (
        <g key={x} transform={`translate(${x} 420)`}>
          <rect width={station.length * 15 + 70} height="40" rx="4" fill="#1b2a5e" />
          <rect width={station.length * 15 + 70} height="12" rx="4" fill="#fff" opacity=".08" />
          <circle cx="22" cy="20" r="12" fill="#d9322a" />
          <path d="M15 26 V13 L22 21 L29 13 V26" stroke="#fff" strokeWidth="2.6" fill="none" />
          <text x="44" y="27" fontSize="17" fill="#fff" fontFamily="Unbounded, sans-serif" fontWeight="500">{station.toUpperCase()}</text>
        </g>
      ))}
      {trainMode !== 'none' && (
        <g
          key={trainMode === 'leave' ? 'leave' : 'train'}
          className={`${trainMode === 'loop' ? 'train-arrive keep-anim' : trainMode === 'arrive' ? 'train-in' : trainMode === 'leave' ? 'train-out' : ''} ${doorsOpen ? 'doors-open' : trainMode === 'loop' ? '' : 'doors-shut'}`}
          style={{ ['--dur' as string]: trainMode === 'leave' ? '9s' : '4.5s' }}
        >
          <TrainSide />
        </g>
      )}
      {/* путь и платформа: гранит с отражениями */}
      <rect x="-60" y="640" width="1720" height="60" fill="#211f2a" />
      <rect x="-60" y="668" width="1720" height="5" fill="#8a8794" />
      <rect x="-60" y="696" width="1720" height="224" fill="#9a8e86" />
      <rect x="-60" y="696" width="1720" height="224" fill="url(#pat-tiles)" opacity=".7" />
      <rect x="-60" y="696" width="1720" height="224" fill="url(#tex-grain)" opacity=".35" />
      <rect x="-60" y="700" width="1720" height="10" fill="#e8c040" />
      {Array.from({ length: 9 }, (_, i) => <ellipse key={i} cx={100 + i * 190} cy="790" rx="80" ry="14" fill="#fff4d8" opacity=".14" />)}
      {[300, 1180].map((x) => (
        <g key={x} transform={`translate(${x} 734) scale(.9)`}>
          <ellipse cx="0" cy="2" rx="104" ry="8" fill="url(#contact)" />
          <rect x="-90" y="-40" width="180" height="40" rx="8" fill="#6b5244" />
          <rect x="-96" y="-48" width="192" height="12" rx="6" fill="#9a7a5e" />
          <rect x="-96" y="-48" width="192" height="12" rx="6" fill="url(#shade-y)" />
        </g>
      ))}
      <SeatedFolks items={[{ x: 286, y: 734, s: 0.9, seed: 21, pose: 'read' }]} />
      <EntityBand crowd={crowd} yMax={place.y} />
      <g key={`${eventKey}${heroWrap}`} className={heroWrap} style={{ ['--dur' as string]: heroDur }}>
        <Hero place={place} />
      </g>
      <EntityBand crowd={crowd} yMin={place.y} />
    </>
  )
  const lights = (
    <>
      {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={100 + i * 190} cy="86" r="160" fill="url(#glow-warm)" opacity=".5" style={{ mixBlendMode: 'screen' }} />)}
      <rect x="-60" y="420" width="1720" height="200" fill="url(#glow-warm)" opacity=".12" />
    </>
  )
  const bloom = <>{Array.from({ length: 9 }, (_, i) => <ellipse key={i} cx={100 + i * 190} cy="86" rx="18" ry="9" fill="#fffbe9" />)}</>
  return (
    <div className="absolute inset-0" data-testid="metro-station" data-phase={phase ?? 'none'} data-train={trainMode}>
      <SceneShell back={back} art={art} lights={lights} bloom={bloom} depths={{ back: 3 }} />
    </div>
  )
}

/** Табло станции: название, линия, часы (игровое время), следующий поезд. */
function StationBoard({ station, line }: { station: string; line: LineDef }) {
  const minutes = useWorldStore((s) => Math.floor(s.minutes))
  const next = 1 + ((minutes * 7) % 3)
  return (
    <g transform="translate(560 180)" data-testid="station-board">
      <rect width="480" height="210" rx="14" fill="#1a1d33" stroke="#bfa87a" strokeWidth="6" />
      <rect x="20" y="20" width="440" height="56" rx="8" fill="#232846" />
      <circle cx="52" cy="48" r="18" fill="#d9322a" />
      <path d="M42 57 V39 L52 50 L62 39 V57" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinejoin="round" />
      <text x="82" y="58" fontSize="24" fill="#fff3e2" fontFamily="Unbounded, sans-serif" fontWeight="500">{station.toUpperCase().slice(0, 16)}</text>
      <circle cx="31" cy="99" r="11" fill={line.color} />
      <text x="31" y="104" fontSize="12" fill="#fff" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="800">{line.no}</text>
      <text x="50" y="105" fontSize="17" fill="#e8dcc4" fontFamily="Manrope, sans-serif" fontWeight="600">{line.name} линия</text>
      <text x="20" y="150" fontSize="15" fill="#e8dcc4" opacity=".75" fontFamily="Manrope, sans-serif">Следующий поезд через</text>
      <text x="20" y="186" fontSize="30" fill="#ffd27a" fontFamily="Unbounded, sans-serif" fontWeight="500">{next} мин</text>
      <rect x="300" y="120" width="160" height="70" rx="8" fill="#0d0f1e" />
      <text x="380" y="168" fontSize="34" fill="#ffb27a" textAnchor="middle" fontFamily="Unbounded, sans-serif" fontWeight="500" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTime(minutes)}</text>
    </g>
  )
}

export { Person, randomPalette }
