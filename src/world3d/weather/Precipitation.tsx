/**
 * Дождь и снег (План §5 «Погода»): штрихи/хлопья в объёме 60×40×60 м вокруг камеры, положение считается в вершинном
 * шейдере из времени — буферы после создания не пишутся. Число штрихов — `quality.precipitationMax`, видимая доля —
 * интенсивность осадков из `worldLight` (лишние вершины схлопываются в шейдере). Без осадков меши скрыты (0 draw calls).
 * Дальше по высоте/радиусу штрихи гаснут, цвет — от тумана (= горизонт неба), ночью темнее.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  LineSegments,
  NormalBlending,
  type PerspectiveCamera,
  Points,
  ShaderMaterial,
} from 'three'
import { stepDelta, WORLD_TIME_PERIOD } from '../frame'
import { worldLight } from '../light/worldLight'
import type { QualitySettings } from '../quality'

// ───────── Числа (Plan §5: объём 60×40×60; остальное — оценочное, подобрано по кадрам) ─────────
export const VOLUME_M = { x: 60, y: 40, z: 60 } as const
/** Скорость падения капли, м/с, и длина штриха при скорости 1 с, м. */
export const RAIN_SPEED = 9
export const RAIN_STREAK_M = 0.55
/** Скорость падения хлопьев, м/с, диаметр хлопьев, м. */
export const SNOW_SPEED = 1.1
export const SNOW_SIZE_M = 0.11
/** Ниже этой интенсивности осадки не рисуются. */
export const MIN_INTENSITY = 0.02
/** Наклон дождя от ветра: tan угла при wind = 1. */
export const RAIN_SLANT = 0.45

/** Детерминированные семена [0,1): по 4 числа на штрих (x, y, z, h). mulberry32 — тот же воспроизводимый поток кадров. */
export function makeSeeds(count: number, seed = 1): Float32Array {
  const out = new Float32Array(count * 4)
  let a = seed >>> 0
  for (let i = 0; i < out.length; i++) {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    out[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return out
}

/** Доля показываемых штрихов при интенсивности `k` (0..1): степень 1.5 — лёгкий дождь редкий, ливень плотный. */
export function densityOf(k: number): number {
  return k < MIN_INTENSITY ? 0 : Math.min(1, k) ** 1.5
}

const COMMON_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uVol;
uniform float uDensity;
uniform float uWind;
attribute vec4 aSeed;
varying float vA;
// Положение в объёме вокруг камеры: XZ заворачивается относительно камеры, Y — падение от 0 до uVol.y над землёй.
vec3 volumePos(vec4 s, float speed) {
  float y = mod(s.y * uVol.y - uTime * speed, uVol.y);
  vec2 xz = s.xz * uVol.xz + vec2(uWind * (uVol.y - y) * 0.4, 0.0);
  vec2 rel = mod(xz - uCam.xz + uVol.xz * 0.5, uVol.xz) - uVol.xz * 0.5;
  return vec3(uCam.x + rel.x, y, uCam.z + rel.y);
}
float fadeOf(vec3 p) {
  vec2 r = (p.xz - uCam.xz) / (uVol.xz * 0.5);
  float edge = 1.0 - smoothstep(0.55, 1.0, length(r));
  float top = 1.0 - smoothstep(0.75, 1.0, p.y / uVol.y);
  return edge * top;
}
`

const RAIN_VERT = /* glsl */ `
${COMMON_VERT}
attribute float aEnd;
uniform float uSlant;
uniform float uStreak;
void main() {
  float spd = ${RAIN_SPEED.toFixed(2)} * (0.85 + 0.3 * aSeed.w);
  vec3 p = volumePos(aSeed, spd);
  vec3 dir = normalize(vec3(uSlant, -1.0, 0.0));
  float vis = step(aSeed.w, uDensity);
  vec3 q = p - dir * (uStreak * (0.8 + 0.4 * aSeed.w)) * aEnd;
  vA = fadeOf(p) * (1.0 - 0.5 * aEnd) * vis;
  gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
}
`

const SNOW_VERT = /* glsl */ `
${COMMON_VERT}
uniform float uPx;
uniform float uSize;
void main() {
  float spd = ${SNOW_SPEED.toFixed(2)} * (0.7 + 0.6 * aSeed.w);
  vec3 p = volumePos(aSeed, spd);
  float ph = aSeed.w * 62.83;
  p.x += sin(uTime * (0.6 + aSeed.w) + ph) * 0.5;
  p.z += cos(uTime * (0.5 + aSeed.z) + ph) * 0.5;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float vis = step(aSeed.w, uDensity);
  vA = fadeOf(p) * vis;
  gl_PointSize = max(1.5, uSize * (0.6 + 0.8 * aSeed.x) * uPx / max(0.5, -mv.z)) * vis;
  gl_Position = projectionMatrix * mv;
}
`

const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vA;
void main() {
  if (vA < 0.01) discard;
  gl_FragColor = vec4(uColor, uAlpha * vA);
}
`

const SNOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vA;
void main() {
  if (vA < 0.01) discard;
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = 1.0 - smoothstep(0.35, 1.0, d);
  gl_FragColor = vec4(uColor, uAlpha * vA * a);
}
`

type Uniforms = ShaderMaterial['uniforms']

function baseUniforms(): Uniforms {
  return {
    uTime: { value: 0 },
    uCam: { value: { x: 0, y: 0, z: 0 } },
    uVol: { value: { x: VOLUME_M.x, y: VOLUME_M.y, z: VOLUME_M.z } },
    uDensity: { value: 0 },
    uWind: { value: 0 },
    uColor: { value: { x: 1, y: 1, z: 1 } },
    uAlpha: { value: 0.5 },
  }
}

interface Rig {
  rain: LineSegments
  snow: Points
  rainU: Uniforms
  snowU: Uniforms
  dispose: () => void
}

function buildRig(count: number): Rig {
  const seeds = makeSeeds(count, 20260117)
  // Дождь: 2 вершины на штрих (верх, хвост), общий семя на обе.
  const rainSeeds = new Float32Array(count * 8)
  const ends = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    for (let e = 0; e < 2; e++) {
      rainSeeds.set(seeds.subarray(i * 4, i * 4 + 4), (i * 2 + e) * 4)
      ends[i * 2 + e] = e
    }
  }
  const rainGeo = new BufferGeometry()
  rainGeo.setAttribute('position', new BufferAttribute(new Float32Array(count * 6), 3))
  rainGeo.setAttribute('aSeed', new BufferAttribute(rainSeeds, 4))
  rainGeo.setAttribute('aEnd', new BufferAttribute(ends, 1))
  const rainU: Uniforms = { ...baseUniforms(), uSlant: { value: 0 }, uStreak: { value: RAIN_STREAK_M } }
  const rainMat = new ShaderMaterial({
    uniforms: rainU,
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  })
  const rain = new LineSegments(rainGeo, rainMat)
  rain.frustumCulled = false
  rain.renderOrder = 10
  rain.visible = false

  const snowGeo = new BufferGeometry()
  snowGeo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
  snowGeo.setAttribute('aSeed', new BufferAttribute(seeds, 4))
  const snowU: Uniforms = { ...baseUniforms(), uPx: { value: 800 }, uSize: { value: SNOW_SIZE_M } }
  const snowMat = new ShaderMaterial({
    uniforms: snowU,
    vertexShader: SNOW_VERT,
    fragmentShader: SNOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  })
  const snow = new Points(snowGeo, snowMat)
  snow.frustumCulled = false
  snow.renderOrder = 10
  snow.visible = false

  return {
    rain,
    snow,
    rainU,
    snowU,
    dispose: () => {
      rainGeo.dispose()
      rainMat.dispose()
      snowGeo.dispose()
      snowMat.dispose()
    },
  }
}

function writeCommon(u: Uniforms, t: number, cam: Camera, density: number, wind: number, tint: number): void {
  u.uTime.value = t
  const c = u.uCam.value as { x: number; y: number; z: number }
  c.x = cam.position.x
  c.y = cam.position.y
  c.z = cam.position.z
  u.uDensity.value = density
  u.uWind.value = wind
  const col = u.uColor.value as { x: number; y: number; z: number }
  const f = worldLight.fogColor
  col.x = (f.r * 0.6 + 0.4) * tint
  col.y = (f.g * 0.6 + 0.4) * tint
  col.z = (f.b * 0.6 + 0.4) * tint
}

export default function Precipitation({ quality }: { quality: QualitySettings }) {
  const count = quality.precipitationMax
  const rig = useMemo(() => buildRig(count), [count])
  const timeRef = useRef(0)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  useEffect(() => () => rig.dispose(), [rig])

  useFrame((state, delta) => {
    const w = worldLight
    const rainK = w.rain
    const snowK = w.snow
    rig.rain.visible = rainK >= MIN_INTENSITY
    rig.snow.visible = snowK >= MIN_INTENSITY
    if (!rig.rain.visible && !rig.snow.visible) return
    timeRef.current = (timeRef.current + stepDelta(delta)) % WORLD_TIME_PERIOD
    const t = timeRef.current
    const tint = 0.35 + 0.65 * (1 - w.night)
    const cam = state.camera
    if (rig.rain.visible) {
      writeCommon(rig.rainU, t, cam, densityOf(rainK), w.wind, tint)
      rig.rainU.uSlant.value = w.wind * RAIN_SLANT
      rig.rainU.uAlpha.value = 0.25 + 0.3 * rainK
    }
    if (rig.snow.visible) {
      writeCommon(rig.snowU, t, cam, Math.sqrt(densityOf(snowK)), w.wind * 0.5, tint)
      rig.snowU.uAlpha.value = 0.55 + 0.25 * snowK
      // пикселей на метр на расстоянии 1 м: высота вьюпорта в px / (2·tan(fov/2)), с учётом dpr
      const fov = ((cam as PerspectiveCamera).fov * Math.PI) / 360
      rig.snowU.uPx.value = (size.height * dpr) / (2 * Math.tan(fov))
    }
  })

  return (
    <>
      <primitive object={rig.rain} />
      <primitive object={rig.snow} />
    </>
  )
}
