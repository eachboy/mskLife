/**
 * Земля района (План §5 «Дороги»): единая поверхность асфальта без выдуманной дорожной сети + тротуарная полоса
 * вдоль контуров зданий. Полоса — по полю расстояний до стен домов, которое считается один раз из тайла
 * (`buildDistanceField`, чистая функция без three) и кладётся в R8-текстуру; сам рисунок (пятна, зерно, швы,
 * плитка, бордюр, лужи, снег) — процедурный, в шейдере по мировым XZ. Разметки нет: у неё нет источника данных.
 * Мокрое/снег — те же `facadeUniforms.uWet/uSnow` из light/worldLight.ts. Покадрово — только позиция меша за камерой.
 * Края мира нет: плоскость 4400 м едет за камерой, а дальше 450–1600 м цвет плавно сходится с туманом (= горизонт неба).
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  DataTexture,
  LinearFilter,
  type Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RedFormat,
  UnsignedByteType,
} from 'three'
import type { QualityLevel } from '../../types'
import { facadeUniforms } from '../light/worldLight'
import { qualitySettings } from '../quality'
import {
  buildDistanceField,
  createDistanceBuilder,
  DF_MAX_M,
  DF_SIZE,
  type DistanceField,
  fieldMeters,
  loadDistanceField,
  SIDEWALK_M,
} from './distanceField'
import { LAMP_REFL_MAX, lampReflUniforms } from './lampField'

// ───────── Числа (не из Плана: оценочные, подобраны по кадрам; Plan §5 задаёт только roughness 0.9 → 0.15) ─────────
/** Сторона плоскости, м: больше `far`-радиуса, чтобы граница уходила в туман. */
export const GROUND_SIZE_M = 4400
/** Асфальт, линейный RGB (диапазон 0.08–0.12 по заданию architect). */
export const ASPHALT_LINEAR = [0.052, 0.054, 0.059] as const
/** Блик сухого асфальта на скользящих углах (specularF90 по умолчанию 1 даёт белёсую пелену к солнцу); мокрый — 1. */
export const DRY_F90 = 0.1
/** Яркость бликов фонарей на мокром (HDR, множитель к цвету лампы). */
export const REFL_GAIN = 8
/** Дальность, на которой земля начинает и заканчивает сходиться с туманом, м. */
export const FADE_NEAR_M = 450
export const FADE_FAR_M = 1600

// Поле расстояний вынесено в distanceField.ts (общее с Lamps); реэкспорт — для тестов и прежних импортов.
export { buildDistanceField, createDistanceBuilder, DF_MAX_M, DF_SIZE, type DistanceField, fieldMeters, SIDEWALK_M }

// ───────── Шейдер ─────────
const f4 = (x: number): string => x.toFixed(4)

const VERT_DECL = /* glsl */ `
varying vec2 vGP;
`
const VERT_MAIN = /* glsl */ `
vGP = (modelMatrix * vec4(transformed, 1.0)).xz;
`

const FRAG_DECL = /* glsl */ `
uniform float uWet;
uniform float uSnow;
uniform vec3 uSky;
uniform sampler2D uDf;
uniform vec2 uDfMin;
uniform float uDfInv;
varying vec2 vGP;
const float DF_MAX = ${f4(DF_MAX_M)};
const float SW = ${f4(SIDEWALK_M)};
const float REFL_GAIN = ${f4(REFL_GAIN)};
const vec3 ASPH = vec3(${ASPHALT_LINEAR.map(f4).join(',')});
uint ghash(vec2 c) {
  uvec2 v = uvec2(c + 8192.0);
  uint x = v.x * 1597334677u ^ v.y * 3812015801u;
  x ^= x >> 16u; x *= 0x7feb352dU; x ^= x >> 15u; x *= 0x846ca68bU; x ^= x >> 16u;
  return x;
}
float grand(vec2 c) { return float(ghash(c) >> 8u) * (1.0 / 16777216.0); }
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(grand(i), grand(i + vec2(1.0, 0.0)), f.x), mix(grand(i + vec2(0.0, 1.0)), grand(i + vec2(1.0, 1.0)), f.x), f.y);
}
float gline(float d, float w, float fw) { return 1.0 - smoothstep(w, w + 0.02 + fw, d); }

#ifdef GROUND_REFL
uniform vec4 uLamp[${LAMP_REFL_MAX}];
uniform float uLamps;
// Аналитические блики светильников на мокром полотне: зеркальная точка M — пересечение луча «камера → отражение
// светильника под землёй» с плоскостью y = 0; рябь растягивает блик вдоль луча (по вертикали в кадре) к основанию столба.
vec3 lampStreaks(vec2 gp) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${LAMP_REFL_MAX}; i++) {
    vec4 L = uLamp[i];
    if (L.w < 0.003) continue;
    vec2 toL = L.xz - cameraPosition.xz;
    float dl = length(toL) + 1e-3;
    vec2 dir = toL / dl;
    float t = cameraPosition.y / (cameraPosition.y + L.y);
    vec2 rel = gp - (cameraPosition.xz + toL * t);
    float u = dot(rel, dir);
    float v = dot(rel, vec2(-dir.y, dir.x));
    float sv = 0.10 + 0.007 * dl;
    float su = 1.5 + 0.40 * dl * (1.0 - t);
    float gv = v / sv;
    float gu = u / (u > 0.0 ? su * 1.6 : su);
    acc += L.w * exp(-gv * gv - gu * gu);
  }
  return acc * vec3(1.0, 0.52, 0.2);
}
#endif
`

/** Тело земли: считает gAlb, gRough, gSky (отражение неба), gSnow. `GROUND_HI` — зерно и швы (High/Medium). */
const FRAG_COLOR = /* glsl */ `
vec2 gp = vGP;
float gDw = textureLod(uDf, (gp - uDfMin) * uDfInv, 0.0).r * DF_MAX;
float gFw = length(fwidth(gp));
float gNear = 1.0 - smoothstep(30.0, 55.0, vFogDepth);

float gB1 = gnoise(gp / 38.0);
float gB2 = gnoise(gp / 9.0 + 11.7);
float gB3 = gnoise(gp / 2.3 + 5.1);
float gBlot = (gB1 - 0.5) * 0.55 + (gB2 - 0.5) * 0.35 + (gB3 - 0.5) * 0.15 * (1.0 - smoothstep(0.5, 3.0, gFw));
vec3 gAsph = ASPH * (1.0 + 0.6 * gBlot);

#ifdef GROUND_HI
float gG1 = grand(floor(gp / 0.035)) - 0.5;
float gG2 = grand(floor(gp / 0.14) + 91.0) - 0.5;
gAsph *= 1.0 + 0.30 * gG1 * (1.0 - smoothstep(0.015, 0.07, gFw)) + 0.18 * gG2 * (1.0 - smoothstep(0.06, 0.28, gFw));
#endif

// тротуар: плитка 0.6 м, светлее асфальта; бордюр и сток на границе
float gWk = 0.05 + gFw * 0.7;
float gPave = 1.0 - smoothstep(SW - gWk, SW + gWk, gDw);
vec2 gTc = gp / 0.6;
float gTile = grand(floor(gTc) + 37.0);
vec2 gTd = min(fract(gTc), 1.0 - fract(gTc)) * 0.6;
float gJoint = max(gline(gTd.x, 0.012, gFw), gline(gTd.y, 0.012, gFw)) * (1.0 - smoothstep(0.3, 1.2, gFw));
vec3 gPaveCol = vec3(0.235, 0.228, 0.215) * (1.0 + gNear * ((gTile - 0.5) * 0.28 + 0.25 * (gB2 - 0.5)));
gPaveCol *= 1.0 - 0.4 * gJoint * gNear;
float gKerb = (1.0 - smoothstep(0.0, gWk, abs(gDw - (SW - 0.08)))) * 0.5;
float gGutter = (1.0 - smoothstep(0.0, gWk + 0.15, abs(gDw - (SW + 0.25)))) * 0.35;
vec3 gCol = mix(gAsph * (1.0 - gGutter), gPaveCol, gPave);
gCol = mix(gCol, vec3(0.32, 0.31, 0.29), gKerb * (1.0 - smoothstep(0.5, 3.0, gFw)));

// мокрое: общее потемнение + лужи по шуму
float gPn = gnoise(gp / 5.5) * 0.65 + gnoise(gp / 1.7 + 3.3) * 0.35;
float gPud = 0.0;
if (uWet > 0.02) {
  // лужи: вытянуты вдоль бордюра, в полосе у тротуара; направление вдоль стены — по градиенту поля
  vec2 gUv = (gp - uDfMin) * uDfInv;
  float gE = 2.0 * uDfInv;
  vec2 gGr = vec2(textureLod(uDf, gUv + vec2(gE, 0.0), 0.0).r - textureLod(uDf, gUv - vec2(gE, 0.0), 0.0).r,
                  textureLod(uDf, gUv + vec2(0.0, gE), 0.0).r - textureLod(uDf, gUv - vec2(0.0, gE), 0.0).r);
  vec2 gTg = normalize(vec2(-gGr.y, gGr.x) + vec2(1e-4, 0.0));
  float gAl = dot(gp, gTg);
  float gLn = gnoise(vec2(gAl / 9.0, gDw / 1.1)) * 0.75 + gnoise(vec2(gAl / 3.0, gDw / 0.5) + 7.7) * 0.25;
  float gBand = smoothstep(SW + 0.05, SW + 0.35, gDw) * (1.0 - smoothstep(SW + 1.0, SW + 2.6, gDw));
  float gThr = 0.80 - 0.18 * uWet;
  gPud = smoothstep(gThr - 0.04, gThr + 0.04, gLn) * gBand * smoothstep(0.02, 0.2, uWet);
}
float gDamp = smoothstep(0.0, 0.5, uWet);

// снег
float gSnow = smoothstep(0.04, 0.30, uSnow * (0.85 + 0.3 * gPn)) * mix(0.85, 1.0, gPave);
gDamp *= 1.0 - gSnow;
gPud *= 1.0 - gSnow;

gCol *= 1.0 - 0.45 * gDamp;
gCol *= 1.0 - 0.3 * gPud;
gCol = mix(gCol, vec3(0.80, 0.84, 0.90), gSnow);
diffuseColor.rgb = gCol;

float gRough = mix(0.9, 0.97, gPave);
gRough = mix(gRough, mix(0.15, 0.4, gPave), smoothstep(0.1, 0.6, uWet) * (1.0 - gSnow));
gRough = mix(gRough, 0.04, gPud);
gRough = mix(gRough, 0.95, gSnow);
`

/** Отражение неба на мокром: Френель по углу взгляда (на скользящем — почти зеркало). */
const FRAG_EMIT = /* glsl */ `
{
  float gNv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
  float gFr = pow(1.0 - gNv, 5.0);
  totalEmissiveRadiance += uSky * gFr * (0.45 * gDamp + 0.55 * gPud);
#ifdef GROUND_REFL
  float gWetK = smoothstep(0.3, 0.5, uWet) * uLamps;
  if (gWetK > 0.0) {
    float gMask = (0.5 * gDamp + 0.5 * gPud) * (1.0 - 0.6 * gPave) * (1.0 - gSnow);
    totalEmissiveRadiance += lampStreaks(vGP) * (REFL_GAIN * gWetK * gMask * (0.25 + 0.75 * gFr + 0.4 * gPud));
  }
#endif
}
`

const FRAG_EDGE = /* glsl */ `
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(${f4(FADE_NEAR_M)}, ${f4(FADE_FAR_M)}, vFogDepth));
`

/** Один материал земли. Low — без зерна и швов. */
export function createGroundMaterial(
  level: QualityLevel,
  df: { value: DataTexture },
  rect: { value: { x: number; y: number } },
  inv: { value: number },
): MeshStandardMaterial {
  const hi = level !== 'low'
  const refl = qualitySettings(level).roadReflections
  const mat = new MeshStandardMaterial({ roughness: 1, metalness: 0 })
  mat.customProgramCacheKey = () => (hi ? 'ground-hi' : 'ground-lo') + (refl ? '-refl' : '')
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = facadeUniforms.uWet
    shader.uniforms.uSnow = facadeUniforms.uSnow
    shader.uniforms.uSky = facadeUniforms.uSky
    shader.uniforms.uDf = df
    shader.uniforms.uDfMin = rect
    shader.uniforms.uDfInv = inv
    if (refl) {
      shader.uniforms.uLamp = lampReflUniforms.uLamp
      shader.uniforms.uLamps = facadeUniforms.uLamps
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}`)
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `${hi ? '#define GROUND_HI\n' : ''}${refl ? '#define GROUND_REFL\n' : ''}#include <common>\n${FRAG_DECL}`,
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
material.specularF90 = mix(${f4(DRY_F90)}, 1.0, max(gDamp, gPud));`,
      )
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_EMIT}`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>\n${FRAG_EDGE}`)
  }
  return mat
}

function fieldTexture(data: Uint8Array, size: number): DataTexture {
  const t = new DataTexture(data, size, size, RedFormat, UnsignedByteType)
  t.minFilter = LinearFilter
  t.magFilter = LinearFilter
  t.generateMipmaps = false
  t.needsUpdate = true
  return t
}

interface Props {
  district: string
  level: QualityLevel
  /** Земля принимает тени домов (по уровню качества). */
  shadows: boolean
}

export default function Ground({ district, level, shadows }: Props) {
  const meshRef = useRef<Mesh | null>(null)

  const res = useMemo(() => {
    const geometry = new PlaneGeometry(GROUND_SIZE_M, GROUND_SIZE_M)
    geometry.rotateX(-Math.PI / 2)
    // пока тайл не пришёл (или его нет) — карта «далеко от домов»: только асфальт
    const blank = fieldTexture(new Uint8Array([255]), 1)
    const df = { value: blank }
    const rect = { value: { x: 0, y: 0 } }
    const inv = { value: 1 }
    return { geometry, blank, df, rect, inv, material: createGroundMaterial(level, df, rect, inv) }
  }, [level])

  useEffect(
    () => () => {
      res.geometry.dispose()
      res.blank.dispose()
      res.material.dispose()
    },
    [res],
  )

  useEffect(() => {
    let alive = true
    let tex: DataTexture | null = null
    loadDistanceField(district)
      .then((f) => {
        if (!alive) return
        tex = fieldTexture(f.data, f.size)
        res.rect.value.x = f.minX
        res.rect.value.y = f.minZ
        res.inv.value = 1 / f.extent
        res.df.value = tex
      })
      .catch(() => {
        // нет тайла — остаётся сплошной асфальт; ошибку тайла уже показывает CityBlocks
      })
    return () => {
      alive = false
      res.df.value = res.blank
      tex?.dispose()
    }
  }, [district, res])

  useFrame((state) => {
    const m = meshRef.current
    if (!m) return
    m.position.x = state.camera.position.x
    m.position.z = state.camera.position.z
  })

  return (
    <mesh ref={meshRef} geometry={res.geometry} material={res.material} receiveShadow={shadows} frustumCulled={false} />
  )
}
