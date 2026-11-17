/**
 * Постобработка — Plan §6, порядок: N8AO → Bloom → [DoF: не в этом шаге] → ToneMapping(AgX) → [LUT: S5] → Vignette → Noise → SMAA.
 * Состав по таблице уровней качества (quality.ts): N8AO — полное/половинное/нет; Bloom — число уровней.
 * Тональная компрессия только здесь (на рендерере NoToneMapping); буфер — HalfFloat.
 * Параметры приходят пропсами; сила Bloom по времени суток пишется в useFrame (без ререндера React).
 */
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, type BloomEffect, ToneMappingMode } from 'postprocessing'
import { useRef } from 'react'
import { HalfFloatType } from 'three'
import { worldLight } from '../light/worldLight'
import type { QualitySettings } from '../quality'

/** §6: Bloom — порог яркости 1.0 в HDR; сила 0.25 днём (0.6 ночью подключит worldLight в стадии света). */
const BLOOM_THRESHOLD = 1.0
const BLOOM_INTENSITY_DAY = 0.25
const BLOOM_INTENSITY_NIGHT = 0.6
/** §6: виньетка 0.25, зерно 0.035. */
const VIGNETTE_DARKNESS = 0.25
const GRAIN_OPACITY = 0.035

/** Не из Плана (сдержанные значения прототипа): параметры N8AO и сглаживание порога Bloom. */
const AO_RADIUS_M = 6
const AO_DISTANCE_FALLOFF = 1
const AO_INTENSITY = 3
const BLOOM_LUMINANCE_SMOOTHING = 0.03

export interface PostStackProps {
  quality: QualitySettings
  /** false — зерно выключено (`?nograin`, детерминизм кадров §10). */
  grain: boolean
}

export default function PostStack({ quality, grain }: PostStackProps) {
  const aoOn = quality.aoResolutionScale > 0
  const bloomRef = useRef<BloomEffect | null>(null)
  // §6: сила Bloom 0.6 ночью / 0.25 днём — по worldLight.night, без ререндера React
  useFrame(() => {
    const b = bloomRef.current
    if (b) b.intensity = BLOOM_INTENSITY_DAY + (BLOOM_INTENSITY_NIGHT - BLOOM_INTENSITY_DAY) * worldLight.night
  })
  return (
    <EffectComposer multisampling={0} frameBufferType={HalfFloatType}>
      {aoOn ? (
        <N8AO
          halfRes={quality.aoResolutionScale < 1}
          aoRadius={AO_RADIUS_M}
          distanceFalloff={AO_DISTANCE_FALLOFF}
          intensity={AO_INTENSITY}
          quality="medium"
        />
      ) : null}
      <Bloom
        ref={bloomRef}
        mipmapBlur
        levels={quality.bloomLevels}
        luminanceThreshold={BLOOM_THRESHOLD}
        luminanceSmoothing={BLOOM_LUMINANCE_SMOOTHING}
        intensity={BLOOM_INTENSITY_DAY}
      />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Vignette darkness={VIGNETTE_DARKNESS} />
      {grain ? <Noise blendFunction={BlendFunction.SOFT_LIGHT} opacity={GRAIN_OPACITY} /> : null}
      <SMAA />
    </EffectComposer>
  )
}
