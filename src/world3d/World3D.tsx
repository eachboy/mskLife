/**
 * Единственный Canvas приложения (Plan §3, инвариант 1). Подключается только динамическим import().
 * Сцена: район из запечённого тайла OSM (city/CityBlocks) + земля, солнце, туман, проезд камеры.
 * React подписан только на quality/lowPerf (через effectiveQuality) и на видимость страницы.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type DirectionalLight, type FogExp2, type HemisphereLight, NoToneMapping, SRGBColorSpace } from 'three'
import { isPageHidden, onPageVisibility } from '../utils/pageVisibility'
import { damp } from '../utils/math'
import { effectiveQuality, useWorldStore } from '../stores/worldStore'
import { advanceWorldTime, frameloopFor, stepDelta } from './frame'
import CityBlocks, { cityDebug } from './city/CityBlocks'
import Ground from './city/Ground'
import Lamps from './city/Lamps'
import { installHeightFog } from './light/heightFog'
import { startWorldLight, stepWorldLight, worldLight } from './light/worldLight'
import PostStack from './post/PostStack'
import { type QualitySettings, qualitySettings } from './quality'
import Sky from './sky/Sky'
import Lightning, { FLASH_GAIN } from './weather/Lightning'
import Precipitation from './weather/Precipitation'

// Высотный туман: патч чанков three до первой компиляции материалов
installHeightFog()

// ───────── Константы ─────────
const DISTRICT = 'tverskaya'

/** 35 мм — вертикальный угол 37.8° (Plan §6). */
const CAMERA_FOV = 37.8
/**
 * Проезд по свободному от домов коридору района tverskaya (найден по сетке 5 м по контурам тайла):
 * x = -120 м от центра, z от -20 до 255 м. Камера смотрит на юг (+Z), качается вокруг z = 117 м,
 * амплитуда 120 м, период 580 с → vmax = 120·2π/580 ≈ 1.30 м/с (≤ 1.5).
 */
const DOLLY_X = -120
const DOLLY_Z_MID = 117
const DOLLY_AMP_M = 120
const DOLLY_OMEGA = (2 * Math.PI) / 580
const CAM_Y_MID = 6
const CAM_Y_AMP = 4
const CAM_DAMP = 6

const SUN_DIST = 500

const CAMERA_PROPS = {
  fov: CAMERA_FOV,
  near: 0.3,
  far: 3000,
  position: [DOLLY_X, CAM_Y_MID, DOLLY_Z_MID] as [number, number, number],
  rotation: [-0.06, Math.PI, 0] as [number, number, number],
}
const GL_PROPS = { antialias: false, powerPreference: 'high-performance' as const, stencil: false }

// ───────── Отладочный хук замеров ─────────
interface GlDebug {
  calls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
  quality: string
  frames: number
  tileMs: number
  tileError: string
}

function readFlags(): { perf: boolean; grain: boolean } {
  const q = typeof location === 'undefined' ? '' : location.search
  const p = new URLSearchParams(q)
  return { perf: import.meta.env.DEV || p.has('perf'), grain: !p.has('nograin') }
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Приоритет 2: после EffectComposer (приоритет 1) читает счётчики кадра и сбрасывает их вручную. */
function GlStats({ level }: { level: string }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const dbg = useMemo<GlDebug>(
    () => ({
      calls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      programs: 0,
      quality: level,
      frames: 0,
      tileMs: cityDebug.tileMs,
      tileError: cityDebug.tileError,
    }),
    [level],
  )
  useEffect(() => {
    gl.info.autoReset = false
    const w = window as unknown as { __gl?: GlDebug; __cam3d?: unknown }
    w.__gl = dbg
    w.__cam3d = camera // только ?perf / dev: скрипты кадров (scripts/shots3d.mjs) ставят камеру
    return () => {
      gl.info.autoReset = true
      if (w.__gl === dbg) delete w.__gl
      if (w.__cam3d === camera) delete w.__cam3d
    }
  }, [gl, dbg, camera])
  useFrame(() => {
    const info = gl.info
    dbg.calls = info.render.calls
    dbg.triangles = info.render.triangles
    dbg.geometries = info.memory.geometries
    dbg.textures = info.memory.textures
    dbg.programs = info.programs ? info.programs.length : 0
    dbg.frames++
    info.reset()
  }, 2)
  return null
}

// ───────── Сцена ─────────
function Scene({ q }: { q: QualitySettings }) {
  const sunRef = useRef<DirectionalLight | null>(null)
  const hemiRef = useRef<HemisphereLight | null>(null)
  const fogRef = useRef<FogExp2 | null>(null)
  const timeRef = useRef(0)
  const still = useMemo(reducedMotion, [])

  // Мост света: тик раз в 250 мс, остановка в скрытой вкладке (light/worldLight.ts).
  useEffect(() => startWorldLight(), [])

  // Параметры карты теней — по уровню качества (quality.ts); свет пересоздаётся по key.
  useLayoutEffect(() => {
    const light = sunRef.current
    if (!light || q.shadowMapSize === 0) return
    const R = q.shadowRadiusM
    const sh = light.shadow
    sh.mapSize.set(q.shadowMapSize, q.shadowMapSize)
    sh.camera.left = -R
    sh.camera.right = R
    sh.camera.top = R
    sh.camera.bottom = -R
    sh.camera.near = 1
    sh.camera.far = SUN_DIST + 2 * R
    sh.camera.updateProjectionMatrix()
    sh.bias = -0.0004
    sh.normalBias = 0.8
  }, [q])

  useFrame((state, delta) => {
    const cam = state.camera
    if (!still) {
      const dt = stepDelta(delta)
      timeRef.current = advanceWorldTime(timeRef.current, delta)
      const t = timeRef.current
      cam.position.z = damp(cam.position.z, DOLLY_Z_MID + DOLLY_AMP_M * Math.sin(DOLLY_OMEGA * t), CAM_DAMP, dt)
      cam.position.y = damp(cam.position.y, CAM_Y_MID + CAM_Y_AMP * Math.sin(2 * DOLLY_OMEGA * t), CAM_DAMP, dt)
    }
    stepWorldLight(stepDelta(delta))
    const w = worldLight
    const light = sunRef.current
    if (light) {
      light.target.position.set(cam.position.x, 0, cam.position.z)
      light.target.updateMatrixWorld()
      light.position.set(
        cam.position.x + w.keyDir.x * SUN_DIST,
        w.keyDir.y * SUN_DIST,
        cam.position.z + w.keyDir.z * SUN_DIST,
      )
      light.color.setRGB(w.keyColor.r, w.keyColor.g, w.keyColor.b)
      light.intensity = w.keyIntensity
    }
    const hemi = hemiRef.current
    if (hemi) {
      // вспышка молнии: рассеянный свет, туман и небо умножаются на (1 + FLASH_GAIN·flash) — пик ≈ 3.2× (Lightning.tsx)
      const fr = 1 + FLASH_GAIN.r * w.flash
      const fg = 1 + FLASH_GAIN.g * w.flash
      const fb = 1 + FLASH_GAIN.b * w.flash
      hemi.color.setRGB(w.hemiSky.r * fr, w.hemiSky.g * fg, w.hemiSky.b * fb)
      hemi.groundColor.setRGB(w.hemiGround.r * fr, w.hemiGround.g * fg, w.hemiGround.b * fb)
      hemi.intensity = w.hemiIntensity
    }
    const fog = fogRef.current
    if (fog) {
      fog.color.setRGB(
        w.fogColor.r * (1 + FLASH_GAIN.r * w.flash),
        w.fogColor.g * (1 + FLASH_GAIN.g * w.flash),
        w.fogColor.b * (1 + FLASH_GAIN.b * w.flash),
      )
      fog.density = w.fogDensity
    }
  })

  return (
    <>
      <Sky quality={q} />
      <fogExp2 attach="fog" ref={fogRef} args={[0xffffff, 0.001]} />
      <hemisphereLight ref={hemiRef} />
      <directionalLight key={q.level} ref={sunRef} castShadow={q.shadowMapSize > 0} />
      <Ground district={DISTRICT} level={q.level} shadows={q.shadowMapSize > 0} />
      <CityBlocks district={DISTRICT} shadows={q.shadowMapSize > 0} />
      <Lamps district={DISTRICT} quality={q} />
      <Precipitation quality={q} />
      <Lightning />
    </>
  )
}

export default function World3D() {
  const level = useWorldStore((s) => effectiveQuality(s))
  const q = qualitySettings(level)
  const flags = useMemo(readFlags, [])
  const [hidden, setHidden] = useState(isPageHidden)
  useEffect(() => {
    setHidden(isPageHidden())
    return onPageVisibility(setHidden)
  }, [])

  return (
    <Canvas
      flat
      shadows={q.shadowMapSize > 0 ? 'percentage' : false}
      dpr={[1, q.dprMax]}
      frameloop={frameloopFor(hidden)}
      gl={GL_PROPS}
      camera={CAMERA_PROPS}
      onCreated={({ gl }) => {
        gl.toneMapping = NoToneMapping
        gl.outputColorSpace = SRGBColorSpace
      }}
    >
      <Scene q={q} />
      <PostStack key={q.level} quality={q} grain={flags.grain} />
      {flags.perf ? <GlStats level={q.level} /> : null}
    </Canvas>
  )
}
