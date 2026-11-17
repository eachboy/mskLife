/**
 * Своё небо (Plan §5): сфера вокруг камеры + ShaderMaterial, без сторонних пакетов и ассетов.
 * High/Medium (`quality.physicalAtmosphere`) — аналитическое рассеяние Релея + Ми (модель Preetham, одна формула
 * в фрагментном шейдере) поверх градиента из `getLighting()`; Low — только градиент тех же цветов.
 * Ночью — звёзды (процедурные, без текстуры) и диск луны. Горизонт неба = `worldLight.horizon` = цвет тумана.
 * Значения приходят из `light/worldLight.ts`; React от времени и погоды не ререндерится.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BackSide, type Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three'
import type { QualitySettings } from '../quality'
import { worldLight } from '../light/worldLight'
import { FLASH_GAIN } from '../weather/Lightning'

/** Радиус купола, м: меньше `far` камеры (3000). */
const SKY_RADIUS = 2000

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform float uNight;
uniform float uStars;
uniform float uOvercast;
uniform float uSunVis;
uniform float uFlash;

const float PI = 3.14159265359;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 gradient(float e) {
  float t = pow(clamp(e, 0.0, 1.0), 0.55);
  vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.5, t));
  return mix(c, uTop, smoothstep(0.4, 1.0, t));
}

float hgPhase(float cosT, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosT, 1.5));
}

#ifdef PHYSICAL
// Preetham-подобное рассеяние (Релей + Ми), одна формула в шейдере.
const vec3 BETA_R = vec3(5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5);
const vec3 MIE_C = vec3(1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14);
const vec3 MIE_K = vec3(0.686, 0.678, 0.666);
const float RAY_Z = 8.4e3;
const float MIE_Z = 1.25e3;

vec3 physicalSky(vec3 d) {
  float turb = 2.0 + uOvercast * 8.0;
  vec3 betaM = 0.434 * (0.2 * turb * 1e-17) * MIE_C * MIE_K * 0.005;
  float e = max(d.y, 0.0);
  float zen = acos(e);
  float inv = 1.0 / (cos(zen) + 0.15 * pow(93.885 - degrees(zen), -1.253));
  vec3 Fex = exp(-(BETA_R * RAY_Z + betaM * MIE_Z) * inv);
  float sunZen = acos(clamp(uSunDir.y, -1.0, 1.0));
  float sunE = 1000.0 * max(0.0, 1.0 - exp(-((1.6110731556870734 - sunZen) / 1.5)));
  float cosT = dot(d, uSunDir);
  vec3 betaRT = BETA_R * (3.0 / (16.0 * PI)) * (1.0 + cosT * cosT);
  vec3 betaMT = betaM * hgPhase(cosT, 0.8);
  vec3 ratio = (betaRT + betaMT) / (BETA_R + betaM);
  vec3 Lin = pow(sunE * ratio * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(sunE * ratio * Fex, vec3(0.5)), clamp(pow(1.0 - uSunDir.y, 5.0), 0.0, 1.0));
  vec3 tex = (Lin + 0.1 * Fex) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  float fade = 1.0 - clamp(1.0 - exp(uSunDir.y * 400000.0 / 450000.0), 0.0, 1.0);
  return pow(tex, vec3(1.0 / (1.2 + 1.2 * fade)));
}
#endif

void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  vec3 col = gradient(e);

#ifdef PHYSICAL
  float w = smoothstep(0.02, 0.3, e) * (1.0 - uOvercast) * (1.0 - uNight) * 0.55;
  col = mix(col, physicalSky(d), w);
#endif

  // Гало и диск солнца (HDR: диск > 1.0 даёт bloom).
  float cosS = dot(d, uSunDir);
  float up = smoothstep(-0.12, 0.05, uSunDir.y);
  float halo = hgPhase(cosS, mix(0.78, 0.45, uOvercast)) * 0.35;
  col += uSunColor * halo * uSunVis * up * smoothstep(-0.05, 0.05, e);
  float disk = smoothstep(0.99997, 0.99999, cosS);
  col += uSunColor * disk * 24.0 * uSunVis * (1.0 - uOvercast) * smoothstep(0.0, 0.02, e);

  // Ночь: звёзды и луна.
  float nightMask = uStars * smoothstep(0.02, 0.25, e);
  if (nightMask > 0.001) {
    vec3 p = d * 90.0;
    vec3 cell = floor(p);
    vec3 f = fract(p) - 0.5;
    float on = step(0.972, hash13(cell));
    vec3 jit = vec3(hash13(cell + 7.1), hash13(cell + 13.7), hash13(cell + 19.3)) - 0.5;
    float star = on * smoothstep(0.14, 0.0, length(f - jit * 0.6)) * (0.4 + 0.6 * hash13(cell + 3.3));
    col += vec3(0.85, 0.92, 1.0) * star * 3.0 * nightMask;
  }
  float cosM = dot(d, uMoonDir);
  float moon = smoothstep(0.99992, 0.99996, cosM) * 5.0 + pow(max(cosM, 0.0), 600.0) * 0.08;
  col += vec3(0.78, 0.86, 1.0) * moon * uNight * (1.0 - uOvercast) * smoothstep(0.0, 0.03, e);

  // Вспышка молнии: небо умножается на (1 + FLASH_GAIN·flash), голубоватый пик ≈ 3.2× (как рассеянный свет и туман).
  col *= vec3(${FLASH_GAIN.r.toFixed(3)}, ${FLASH_GAIN.g.toFixed(3)}, ${FLASH_GAIN.b.toFixed(3)}) * uFlash + 1.0;

  gl_FragColor = vec4(col, 1.0);
}
`

interface SkyUniforms {
  uSunDir: { value: Vector3 }
  uMoonDir: { value: Vector3 }
  uTop: { value: Vector3 }
  uMid: { value: Vector3 }
  uHorizon: { value: Vector3 }
  uSunColor: { value: Vector3 }
  uNight: { value: number }
  uStars: { value: number }
  uOvercast: { value: number }
  uSunVis: { value: number }
  uFlash: { value: number }
}

function makeUniforms(): SkyUniforms {
  return {
    uSunDir: { value: new Vector3(0, 1, 0) },
    uMoonDir: { value: new Vector3(0, -1, 0) },
    uTop: { value: new Vector3() },
    uMid: { value: new Vector3() },
    uHorizon: { value: new Vector3() },
    uSunColor: { value: new Vector3(1, 1, 1) },
    uNight: { value: 0 },
    uStars: { value: 0 },
    uOvercast: { value: 0 },
    uSunVis: { value: 1 },
    uFlash: { value: 0 },
  }
}

export default function Sky({ quality }: { quality: QualitySettings }) {
  const meshRef = useRef<Mesh | null>(null)
  const physical = quality.physicalAtmosphere
  const res = useMemo(() => {
    const uniforms = makeUniforms()
    const material = new ShaderMaterial({
      uniforms: uniforms as unknown as ShaderMaterial['uniforms'],
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: physical ? { PHYSICAL: '' } : {},
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    })
    return { uniforms, material, geometry: new SphereGeometry(1, 32, 16) }
  }, [physical])
  useEffect(
    () => () => {
      res.geometry.dispose()
      res.material.dispose()
    },
    [res],
  )

  useFrame((state) => {
    const m = meshRef.current
    if (!m) return
    m.position.copy(state.camera.position)
    const w = worldLight
    const u = res.uniforms
    u.uSunDir.value.set(w.sunDir.x, w.sunDir.y, w.sunDir.z)
    u.uMoonDir.value.set(w.moonDir.x, w.moonDir.y, w.moonDir.z)
    u.uTop.value.set(w.skyTop.r, w.skyTop.g, w.skyTop.b)
    u.uMid.value.set(w.skyMid.r, w.skyMid.g, w.skyMid.b)
    u.uHorizon.value.set(w.horizon.r, w.horizon.g, w.horizon.b)
    u.uSunColor.value.set(w.sunColor.r, w.sunColor.g, w.sunColor.b)
    u.uNight.value = w.night
    u.uStars.value = w.stars
    u.uOvercast.value = w.overcast
    u.uSunVis.value = w.sunVis
    u.uFlash.value = w.flash
  })

  return (
    <mesh
      ref={meshRef}
      geometry={res.geometry}
      material={res.material}
      scale={SKY_RADIUS}
      frustumCulled={false}
      renderOrder={-1000}
    />
  )
}
