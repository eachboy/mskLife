/**
 * Уличные фонари (План §5 «Ночь»): один InstancedMesh (столб + рука + плашка, один материал, один draw call),
 * плашки светятся от `worldLight.lamps`; настоящих PointLight — не больше `quality.pointLightsMax` ближайших
 * к камере (Low — ни одного: эмиссия + bloom). Расстановка — city/lampField.ts по полю расстояний района.
 * Покадрово: выбор ближайших (массивы выделены один раз) и запись в свет; без осадков и ночи — ничего не делаем.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry,
  type BufferGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  type PointLight,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { facadeUniforms, worldLight } from '../light/worldLight'
import type { QualitySettings } from '../quality'
import { loadDistanceField } from './distanceField'
import {
  fadeWeight,
  LAMP_ARM_M,
  LAMP_HEAD_X_M,
  LAMP_HEAD_Y_M,
  LAMP_HEIGHT_M,
  LAMP_MIN_SPACING_M,
  LAMP_SEED,
  LAMP_REFL_MAX,
  LAMP_REFL_REACH_M,
  LAMP_STRIDE,
  lampReflUniforms,
  makeNearest,
  outsideMask,
  placeLamps,
  selectNearest,
} from './lampField'

// ───────── Числа (не из Плана; подобраны по кадрам) ─────────
/** Сила света одного фонаря, кд (decay 2), и дальность отсечения, м. */
export const LAMP_CANDELA = 2500
export const LAMP_RANGE_M = 55
/** Цвет натриевой лампы (линейный RGB) и HDR-множитель эмиссии плашки (> 1 — даёт bloom). */
export const LAMP_COLOR = [1.0, 0.52, 0.2] as const
export const LAMP_EMISSIVE = 40
/** Блики включаются при влажности выше (План §5: wetness > 0.3; запас под сглаживание шейдера). */
const REFL_MIN_WET = 0.28
/** Цвет столба (линейный RGB). */
const POLE_COLOR = 0x0b0d10

const FRAG_DECL = /* glsl */ `
uniform float uLamps;
varying float vGlow;
`

/** Геометрия фонаря: столб, рука и плашка; атрибут `aGlow` = 1 только у плашки. */
export function buildLampGeometry(): BufferGeometry {
  const part = (w: number, h: number, d: number, x: number, y: number, glow: number): BoxGeometry => {
    const g = new BoxGeometry(w, h, d)
    g.translate(x, y, 0)
    g.setAttribute(
      'aGlow',
      new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(glow), 1),
    )
    return g
  }
  const parts = [
    part(0.14, LAMP_HEIGHT_M, 0.14, 0, LAMP_HEIGHT_M / 2, 0),
    part(LAMP_ARM_M, 0.09, 0.09, LAMP_ARM_M / 2, LAMP_HEIGHT_M - 0.12, 0),
    part(1.0, 0.14, 0.42, LAMP_HEAD_X_M, LAMP_HEAD_Y_M + 0.06, 1),
  ]
  const merged = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  if (!merged) throw new Error('lamp geometry merge failed')
  return merged
}

export function createLampMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: POLE_COLOR, roughness: 0.55, metalness: 0.6 })
  mat.customProgramCacheKey = () => 'lamp'
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLamps = facadeUniforms.uLamps
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(${LAMP_COLOR.map((c) => (c * LAMP_EMISSIVE).toFixed(3)).join(',')}) * vGlow * uLamps;`,
      )
  }
  return mat
}

const M = new Matrix4()
const FWD = new Vector3()

/** Матрицы инстансов: ось X — рука к проезжей части (dx, dz), Y вверх, Z = X × Y. */
export function writeLampMatrices(mesh: InstancedMesh, lamps: Float32Array): void {
  const n = (lamps.length / LAMP_STRIDE) | 0
  for (let i = 0; i < n; i++) {
    const x = lamps[i * LAMP_STRIDE]
    const z = lamps[i * LAMP_STRIDE + 1]
    const dx = lamps[i * LAMP_STRIDE + 2]
    const dz = lamps[i * LAMP_STRIDE + 3]
    M.set(dx, 0, -dz, x, 0, 1, 0, 0, dz, 0, dx, z, 0, 0, 0, 1)
    mesh.setMatrixAt(i, M)
  }
  mesh.instanceMatrix.needsUpdate = true
}

interface Props {
  district: string
  quality: QualitySettings
}

export default function Lamps({ district, quality }: Props) {
  const nLights = quality.level === 'low' ? 0 : quality.pointLightsMax
  const [lamps, setLamps] = useState<Float32Array | null>(null)
  const lightsRef = useRef<(PointLight | null)[]>([])
  const refl = quality.roadReflections
  const nearest = useMemo(() => makeNearest(nLights + 1), [nLights])
  const ahead = useMemo(() => makeNearest(refl ? LAMP_REFL_MAX + 1 : 1), [refl])
  const lit = useRef(false)

  const geometry = useMemo(buildLampGeometry, [])
  const material = useMemo(createLampMaterial, [])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useEffect(() => {
    let alive = true
    loadDistanceField(district)
      .then(async (f) => {
        // два шага по отдельным задачам: ни один не держит главный поток дольше 50 мс (План §4)
        const mask = outsideMask(f)
        await new Promise<void>((r) => setTimeout(r, 0))
        if (alive) setLamps(placeLamps(f, LAMP_SEED, LAMP_MIN_SPACING_M, mask))
      })
      .catch(() => {
        // нет тайла — нет фонарей; ошибку тайла показывает CityBlocks
      })
    return () => {
      alive = false
      setLamps(null)
    }
  }, [district])

  const mesh = useMemo(() => {
    if (!lamps || lamps.length === 0) return null
    const m = new InstancedMesh(geometry, material, (lamps.length / LAMP_STRIDE) | 0)
    writeLampMatrices(m, lamps)
    m.frustumCulled = false
    return m
  }, [lamps, geometry, material])
  useEffect(() => () => mesh?.dispose(), [mesh])

  useFrame((state) => {
    const on = worldLight.lamps
    const lights = lightsRef.current
    const wantRefl = refl && worldLight.wetness > REFL_MIN_WET
    if (on < 0.01 || !lamps || (nLights === 0 && !wantRefl)) {
      if (lit.current) {
        for (let k = 0; k < nLights; k++) {
          const l = lights[k]
          if (l) l.intensity = 0
        }
        lit.current = false
      }
      return
    }
    lit.current = true
    const cam = state.camera.position
    selectNearest(lamps, cam.x, cam.z, nearest)
    for (let k = 0; k < nLights; k++) {
      const l = lights[k]
      if (!l) continue
      if (k >= nearest.n) {
        l.intensity = 0
        continue
      }
      const a = nearest.idx[k] * LAMP_STRIDE
      l.position.set(
        lamps[a] + lamps[a + 2] * LAMP_HEAD_X_M,
        LAMP_HEAD_Y_M - 0.1,
        lamps[a + 1] + lamps[a + 3] * LAMP_HEAD_X_M,
      )
      l.intensity = LAMP_CANDELA * on * fadeWeight(nearest, k, nLights, LAMP_RANGE_M)
    }
    if (wantRefl) {
      // блики дают фонари впереди камеры (позади отражение не видно), по горизонтали — в полуплоскости взгляда
      state.camera.getWorldDirection(FWD)
      selectNearest(lamps, cam.x, cam.z, ahead, FWD.x, FWD.z, 0)
      const u = lampReflUniforms.uLamp.value
      for (let k = 0; k < LAMP_REFL_MAX; k++) {
        if (k >= ahead.n) {
          u[k * 4 + 3] = 0
          continue
        }
        const a = ahead.idx[k] * LAMP_STRIDE
        u[k * 4] = lamps[a] + lamps[a + 2] * LAMP_HEAD_X_M
        u[k * 4 + 1] = LAMP_HEAD_Y_M
        u[k * 4 + 2] = lamps[a + 1] + lamps[a + 3] * LAMP_HEAD_X_M
        u[k * 4 + 3] = on * fadeWeight(ahead, k, LAMP_REFL_MAX, LAMP_REFL_REACH_M)
      }
    }
  })

  return (
    <>
      {mesh ? <primitive object={mesh} /> : null}
      {Array.from({ length: nLights }, (_, k) => (
        <pointLight
          key={k}
          ref={(l: PointLight | null) => {
            lightsRef.current[k] = l
          }}
          color={[LAMP_COLOR[0], LAMP_COLOR[1], LAMP_COLOR[2]]}
          intensity={0}
          distance={LAMP_RANGE_M}
          decay={2}
        />
      ))}
    </>
  )
}
