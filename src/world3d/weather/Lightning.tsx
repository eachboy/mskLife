/**
 * Молния (План §5 «Погода»): вспышка света/неба/тумана и видимый разряд по событию `eventBus 'lightning'`.
 * Подписка — вне React-рендера (обработчик лишь взводит флаг), покадрово — только `useFrame`: огибающая вспышки
 * пишется в `worldLight.flash` (Sky, туман и рассеянный свет в World3D читают её), разряд — LineSegments из заранее
 * построенных вариантов (форма — `mulberry32`, выбор варианта — `setDrawRange`, без аллокаций в кадре).
 * Вне вспышки меш скрыт: 0 draw calls. В скрытой вкладке события игнорируются.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, LineSegments, ShaderMaterial, Vector3 } from 'three'
import { eventBus } from '../../utils/eventBus'
import { mulberry32 } from '../../utils/math'
import { isPageHidden } from '../../utils/pageVisibility'
import { stepDelta } from '../frame'
import { worldLight } from '../light/worldLight'

// ───────── Числа (не из Плана: Plan §5 задаёт лишь «вспышка света по eventBus 'lightning'»; длительности — как у SVG-молнии, 0.9 с) ─────────
/** Длительность всей вспышки, с (CSS-анимация `lightning` в SVG-рендере — 0.9 с). */
export const FLASH_DURATION_S = 0.9
/** Основной удар, второй (через 0.14 с, 0.8 силы) и тусклый хвост. */
const MAIN_TAU_S = 0.045
const SECOND_AT_S = 0.14
const SECOND_TAU_S = 0.055
const TAIL_TAU_S = 0.4
const TAIL_GAIN = 0.05
/**
 * Не из Плана (задание арт-директора S4): пик вспышки — 3–4× рассеянного света, голубоватый (B > G > R), каждый
 * удар ≈ 80–150 мс. Множитель к цвету неба/тумана/hemi: `1 + FLASH_GAIN · flash`; светимость пика ≈ 3.2×.
 */
export const FLASH_GAIN = { r: 2.2, g: 2.7, b: 3.5 } as const
/** Разряд виден, пока огибающая выше порога (мерцание: пропадает в провале между ударами). */
const BOLT_MIN_ENV = 0.22
/** Высота основания облаков, м (верх разряда) и дальность: рядом (distance 0) … далеко (1), м. */
const BOLT_HEIGHT_M = 420
const BOLT_NEAR_M = 180
const BOLT_FAR_M = 1500
/** Разброс по горизонту вокруг направления взгляда, рад (± половина). */
const BOLT_YAW_SPREAD = 0.9
/** Число заготовленных форм разряда и сегментов основного канала. */
const BOLT_VARIANTS = 4
const BOLT_MAIN_SEGMENTS = 16
const BOLT_BRANCHES = 3
const BOLT_BRANCH_SEGMENTS = 6
/** Яркость разряда (HDR, > 1 — даёт bloom). */
const BOLT_COLOR = [3.2, 3.8, 6.0] as const

/** Огибающая вспышки 0..1 в момент `t` с после удара: два удара и хвост. */
export function flashEnvelope(t: number): number {
  if (t < 0 || t >= FLASH_DURATION_S) return 0
  const main = Math.exp(-t / MAIN_TAU_S)
  const second = t > SECOND_AT_S ? 0.8 * Math.exp(-(t - SECOND_AT_S) / SECOND_TAU_S) : 0
  const tail = TAIL_GAIN * Math.exp(-t / TAIL_TAU_S)
  return Math.min(1, Math.max(main, second) + tail)
}

/** Сила вспышки по дальности удара: рядом (0) — полная, далеко (1) — 0.45. */
export function flashAmplitude(distance: number): number {
  const near = 1 - Math.min(1, Math.max(0, distance))
  return 0.45 + 0.55 * near
}

/**
 * Разряд единичной высоты: от (0, 1, 0) вниз к (0, 0, 0). Главный канал — ломаная со смещением по X/Z, ветви
 * уходят вниз и вбок. Возвращает пары вершин LineSegments (x, y, z).
 */
export function buildBolt(seed: number): Float32Array {
  const rnd = mulberry32(seed)
  const segs = BOLT_MAIN_SEGMENTS + BOLT_BRANCHES * BOLT_BRANCH_SEGMENTS
  const out = new Float32Array(segs * 6)
  const mainX = new Float32Array(BOLT_MAIN_SEGMENTS + 1)
  const mainZ = new Float32Array(BOLT_MAIN_SEGMENTS + 1)
  let o = 0
  const put = (x: number, y: number, z: number): void => {
    out[o++] = x
    out[o++] = y
    out[o++] = z
  }
  let x = 0
  let z = 0
  for (let i = 1; i <= BOLT_MAIN_SEGMENTS; i++) {
    const y0 = 1 - (i - 1) / BOLT_MAIN_SEGMENTS
    const y1 = 1 - i / BOLT_MAIN_SEGMENTS
    put(x, y0, z)
    x += (rnd() - 0.5) * 0.07
    z += (rnd() - 0.5) * 0.07
    put(x, y1, z)
    mainX[i] = x
    mainZ[i] = z
  }
  for (let b = 0; b < BOLT_BRANCHES; b++) {
    const at = 2 + Math.floor(rnd() * (BOLT_MAIN_SEGMENTS - 6))
    let bx = mainX[at]
    let bz = mainZ[at]
    let by = 1 - at / BOLT_MAIN_SEGMENTS
    const dir = rnd() < 0.5 ? -1 : 1
    for (let i = 0; i < BOLT_BRANCH_SEGMENTS; i++) {
      put(bx, by, bz)
      bx += dir * (0.012 + rnd() * 0.03)
      bz += (rnd() - 0.5) * 0.04
      by -= 0.035 + rnd() * 0.02
      put(bx, Math.max(0, by), bz)
    }
  }
  return out
}

const VERT = /* glsl */ `
void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
void main() { gl_FragColor = vec4(uColor * uAlpha, 1.0); }
`

interface Rig {
  bolt: LineSegments
  uAlpha: { value: number }
  /** Начало и длина каждого варианта в вершинах (для setDrawRange). */
  segVerts: number
  dispose: () => void
}

function buildRig(): Rig {
  const segVerts = (BOLT_MAIN_SEGMENTS + BOLT_BRANCHES * BOLT_BRANCH_SEGMENTS) * 2
  const all = new Float32Array(BOLT_VARIANTS * segVerts * 3)
  for (let v = 0; v < BOLT_VARIANTS; v++) all.set(buildBolt(20261117 + v * 7919), v * segVerts * 3)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(all, 3))
  const uAlpha = { value: 1 }
  const material = new ShaderMaterial({
    uniforms: { uColor: { value: new Vector3(BOLT_COLOR[0], BOLT_COLOR[1], BOLT_COLOR[2]) }, uAlpha },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false,
  })
  const bolt = new LineSegments(geometry, material)
  bolt.frustumCulled = false
  bolt.visible = false
  bolt.renderOrder = 11
  return {
    bolt,
    uAlpha,
    segVerts,
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
}

/** Состояние вспышки: обработчик события пишет, `useFrame` читает. Один объект на модуль. */
const strike = { pending: false, distance: 0, count: 0 }

/** Генератор разброса по горизонту (без аллокаций в кадре): состояние — число. */
let yawState = 0x9e3779b9
function nextYaw(): number {
  yawState = (Math.imul(yawState, 1664525) + 1013904223) >>> 0
  return yawState / 4294967296
}

const FWD = new Vector3()

export default function Lightning() {
  const rig = useMemo(buildRig, [])
  const t = useRef(FLASH_DURATION_S)
  const amp = useRef(0)
  useEffect(() => () => rig.dispose(), [rig])

  useEffect(
    () =>
      eventBus.on('lightning', ({ distance }) => {
        if (isPageHidden()) return
        strike.pending = true
        strike.distance = distance
      }),
    [],
  )

  useFrame((state, delta) => {
    if (strike.pending) {
      strike.pending = false
      strike.count++
      t.current = 0
      amp.current = flashAmplitude(strike.distance)
      const d = BOLT_NEAR_M + (BOLT_FAR_M - BOLT_NEAR_M) * Math.min(1, Math.max(0, strike.distance))
      const cam = state.camera
      cam.getWorldDirection(FWD)
      const yaw = Math.atan2(FWD.x, FWD.z) + (nextYaw() - 0.5) * BOLT_YAW_SPREAD
      const bolt = rig.bolt
      bolt.position.set(cam.position.x + Math.sin(yaw) * d, 0, cam.position.z + Math.cos(yaw) * d)
      bolt.scale.set(BOLT_HEIGHT_M, BOLT_HEIGHT_M, BOLT_HEIGHT_M)
      bolt.rotation.y = yaw
      const v = strike.count % BOLT_VARIANTS
      bolt.geometry.setDrawRange(v * rig.segVerts, rig.segVerts)
    } else if (t.current >= FLASH_DURATION_S) {
      return
    } else {
      t.current += stepDelta(delta)
    }
    const env = flashEnvelope(t.current)
    worldLight.flash = env * amp.current
    rig.uAlpha.value = env
    rig.bolt.visible = env > BOLT_MIN_ENV
    if (t.current >= FLASH_DURATION_S) {
      worldLight.flash = 0
      rig.bolt.visible = false
    }
  })

  return <primitive object={rig.bolt} />
}
