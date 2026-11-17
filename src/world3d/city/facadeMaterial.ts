/**
 * Фасадный материал (План §5 «Фасадный шейдер», «Ночь»): MeshStandardMaterial + onBeforeCompile.
 * Всё считается в шейдере по атрибутам тайла aUv (x — длина вдоль ребра, м; y — высота, м), aHeight, aSeed, aKind:
 * сетка окон 3.0 × 3.2 м, цоколь, карниз, тяги, цвет штукатурки, намокание, снег, ночная эмиссия окон.
 * Покадровых вычислений на CPU нет: uniforms (`facadeUniforms`) пишет light/worldLight.ts.
 *
 * Чистые функции ниже (палитра, доля горящих окон, число этажей) — единый источник чисел: GLSL строится из них
 * и зеркалит их формулы; тесты — facadeMaterial.test.ts.
 */
import { MeshStandardMaterial } from 'three'
import type { QualityLevel } from '../../types'
import { facadeUniforms } from '../light/worldLight'

// ───────── Числа ─────────
/** План §5: шаг сетки окон. */
export const CELL_W_M = 3.0
export const CELL_H_M = 3.2
/** Не из Плана: высота цоколя (по заданию ~3.5 м), доля высоты для низких зданий. */
export const PLINTH_M = 3.5
export const PLINTH_FRACTION = 0.35
/** Не из Плана: высота карниза, м (исторические выше) и доля высоты для низких зданий. */
export const CORNICE_M = 0.9
export const CORNICE_HISTORIC_M = 1.2
export const CORNICE_FRACTION = 0.12
/** План §5 «Ночь»: доля горящих окон = 0.18 + 0.5·night. Не из Плана: у офисов — ×0.6. */
export const LIT_BASE = 0.18
export const LIT_NIGHT = 0.5
export const OFFICE_LIT_SCALE = 0.6

// ───────── Палитра (не из Плана: оценочная, по lookdev v2; sRGB hex) ─────────
/** По aKind: 0 жилой, 1 офис, 2 исторический, 3 стекло; по 4 оттенка, выбор по aSeed. */
export const KIND_PALETTE: readonly (readonly string[])[] = [
  ['#d3a96a', '#d9c08f', '#e6d6ac', '#b9694a'],
  ['#b7ad98', '#a3b0b5', '#b9b2a0', '#98aaa8'],
  ['#e0b872', '#d9a860', '#e4c895', '#c98b5a'],
  ['#3d5568', '#2f4a5e', '#4b6477', '#36505c'],
]
const PALETTE_STEPS = 4
const SEED_SHADE_BASE = 0.94
const SEED_SHADE_SPAN = 0.12

export interface Rgb01 {
  r: number
  g: number
  b: number
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
const kindIndex = (kind: number): number => Math.min(3, Math.max(0, Math.round(kind)))

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function hexChannel(hex: string, i: number): number {
  return Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
}

/** Цвет стены (sRGB 0..1) по виду и seed — та же формула, что в шейдере. */
export function paletteColor(kind: number, seed: number, out: Rgb01): Rgb01 {
  const s = clamp01(seed)
  const pal = KIND_PALETTE[kindIndex(kind)]
  const k = SEED_SHADE_BASE + SEED_SHADE_SPAN * ((s * PALETTE_STEPS) % 1)
  const hex = pal[Math.min(PALETTE_STEPS - 1, Math.floor(s * PALETTE_STEPS))]
  out.r = Math.min(1, hexChannel(hex, 0) * k)
  out.g = Math.min(1, hexChannel(hex, 1) * k)
  out.b = Math.min(1, hexChannel(hex, 2) * k)
  return out
}

/** Доля горящих окон: 0.18 + 0.5·night (офисы ×0.6), ограничена 0..1. Монотонна по night. */
export function litFraction(night: number, kind: number): number {
  const f = LIT_BASE + LIT_NIGHT * clamp01(night)
  return clamp01(kindIndex(kind) === 1 ? f * OFFICE_LIT_SCALE : f)
}

export const plinthHeight = (h: number): number => Math.min(PLINTH_M, PLINTH_FRACTION * h)
export const corniceHeight = (h: number, kind: number): number =>
  Math.min(kindIndex(kind) === 2 ? CORNICE_HISTORIC_M : CORNICE_M, CORNICE_FRACTION * h)
/** Высота оконной зоны между цоколем и карнизом. */
export const windowZone = (h: number, kind: number): number =>
  Math.max(h - plinthHeight(h) - corniceHeight(h, kind), 0.1)
/** Число этажей в зоне окон: шаг ≈ 3.2 м, не меньше одного. */
export const floorCount = (h: number, kind: number): number =>
  Math.max(1, Math.floor(windowZone(h, kind) / CELL_H_M + 0.5))
/** Фактическая высота этажа (зона делится на целое число этажей). */
export const floorHeight = (h: number, kind: number): number => windowZone(h, kind) / floorCount(h, kind)

// ───────── GLSL ─────────
const f4 = (x: number): string => x.toFixed(4)

function paletteGlsl(): string {
  const parts: string[] = []
  for (const pal of KIND_PALETTE) {
    for (const hex of pal) {
      parts.push(
        `vec3(${f4(srgbToLinear(hexChannel(hex, 0)))},${f4(srgbToLinear(hexChannel(hex, 1)))},${f4(srgbToLinear(hexChannel(hex, 2)))})`,
      )
    }
  }
  return `const vec3 FPAL[16] = vec3[16](${parts.join(',')});`
}

const VERT_DECL = /* glsl */ `
attribute vec2 aUv;
attribute float aHeight;
attribute float aSeed;
attribute float aKind;
varying vec2 vFUv;
flat varying float vFH;
flat varying float vFSeed;
flat varying float vFKind;
varying float vFUp;
`
const VERT_MAIN = /* glsl */ `
vFUv = aUv;
vFH = aHeight;
vFSeed = aSeed;
vFKind = aKind;
vFUp = normal.y;
`

function fragDecl(): string {
  return /* glsl */ `
uniform float uWet;
uniform float uSnow;
uniform float uNight;
uniform vec3 uSky;
varying vec2 vFUv;
flat varying float vFH;
flat varying float vFSeed;
flat varying float vFKind;
varying float vFUp;
const float CELL_W = ${f4(CELL_W_M)};
const float CELL_H = ${f4(CELL_H_M)};
const float PLINTH_M = ${f4(PLINTH_M)};
const float PLINTH_F = ${f4(PLINTH_FRACTION)};
const float COR_M = ${f4(CORNICE_M)};
const float COR_HIST_M = ${f4(CORNICE_HISTORIC_M)};
const float COR_F = ${f4(CORNICE_FRACTION)};
const float LIT_BASE = ${f4(LIT_BASE)};
const float LIT_NIGHT = ${f4(LIT_NIGHT)};
const float OFFICE_LIT = ${f4(OFFICE_LIT_SCALE)};
${paletteGlsl()}
uint fhash(uint x) {
  x ^= x >> 16u; x *= 0x7feb352dU; x ^= x >> 15u; x *= 0x846ca68bU; x ^= x >> 16u;
  return x;
}
float frand(uint x) { return float(fhash(x) >> 8u) * (1.0 / 16777216.0); }
float FK(int k, float a, float b, float c, float d) { return k == 0 ? a : (k == 1 ? b : (k == 2 ? c : d)); }
`
}

/** Тело фасада: считает fAlbedo, fRough, fEmit, fHgt, fRoof. Блоки `#ifdef FACADE_HI` — только High/Medium. */
const FRAG_COLOR = /* glsl */ `
int fk = int(vFKind + 0.5);
float fH = vFH;
float fSeed = vFSeed;
bool fRoof = vFUp > 0.5;
uint fsid = uint(fSeed * 65535.0 + 0.5);
float fy0 = vFUv.y;
float fu0 = vFUv.x;

int fpi = min(3, int(floor(fSeed * 4.0)));
vec3 fWall = FPAL[fk * 4 + fpi] * (0.94 + 0.12 * fract(fSeed * 4.0));

float fPl = min(PLINTH_M, PLINTH_F * fH);
float fCor = min(fk == 2 ? COR_HIST_M : COR_M, COR_F * fH);
float fZone = max(fH - fPl - fCor, 0.1);
float fNF = max(1.0, floor(fZone / CELL_H + 0.5));
float fFh = fZone / fNF;
float fRy = fy0 - fPl;
float fFlo = floor(fRy / fFh);
float fFy = fRy / fFh - fFlo;
float fPu = fu0 / CELL_W;
float fCx = floor(fPu);
float fFx = fPu - fCx;
float fInZ = (!fRoof && fRy >= 0.0 && fy0 <= fH - fCor) ? 1.0 : 0.0;

// окно: ширина по виду здания, небольшой разброс на здание
float fJit = frand(fsid * 2654435761u + 17u);
float fHw = FK(fk, 0.26, 0.36, 0.20, 0.48) * (0.92 + 0.16 * fJit);
float fHh = FK(fk, 0.30, 0.34, 0.36, 0.46);
vec2 fq = abs(vec2(fFx, fFy) - 0.5) - vec2(fHw, fHh);
float fSd = max(fq.x * CELL_W, fq.y * fFh);
float fAa = fwidth(fSd) * 0.75 + 1e-3;
float fWin = fInZ * (1.0 - smoothstep(-fAa, fAa, fSd));
float fFrW = FK(fk, 0.12, 0.0, 0.26, 0.0);
float fFrame = max(fInZ * (1.0 - smoothstep(-fAa, fAa, fSd - fFrW)) - fWin, 0.0);
float fInner = fWin * (1.0 - smoothstep(0.0, 0.3, -fSd));
float fInnerK = fInner * (fFy > 0.5 ? 1.0 : 0.55);

// случайные числа окна: детерминированы по (колонка, этаж, seed) — без мерцания
uint fHid = uint(int(fCx)) * 1597334677u ^ uint(int(max(fFlo, 0.0))) * 3812015801u ^ fsid * 2246822519u;
float fR1 = frand(fHid);
float fR2 = frand(fHid ^ 0x9e3779b9U);
float fR3 = frand(fHid ^ 0x85ebca6bU);

// цоколь
float fPlM = fRoof ? 0.0 : 1.0 - smoothstep(fPl - 0.06, fPl + 0.06, fy0);
vec3 col = mix(fWall, fWall * FK(fk, 0.55, 0.6, 0.5, 0.55) * vec3(1.0, 0.95, 0.9), fPlM);

// рустовка цоколя исторических (линии гаснут с расстоянием)
float fRowN = fy0 / 0.6;
float fRw = fwidth(fRowN);
float fRr = fract(fRowN);
float fLineH = 1.0 - smoothstep(0.0, 0.05 + fRw, min(fRr, 1.0 - fRr));
float fVu = fu0 / 1.2 + 0.5 * mod(floor(fRowN), 2.0);
float fLineV = 1.0 - smoothstep(0.0, 0.03 + fwidth(fVu), min(fract(fVu), 1.0 - fract(fVu)));
float fRust = max(fLineH, fLineV) * (1.0 - smoothstep(0.15, 0.5, fRw)) * fPlM * (fk == 2 ? 1.0 : 0.0);
col *= 1.0 - 0.35 * fRust;

// тень под карнизом
float fUnder = fRoof ? 0.0 : smoothstep(fH - fCor - 0.8, fH - fCor, fy0) * (fy0 < fH - fCor ? 1.0 : 0.0);
col *= 1.0 - 0.25 * fUnder;

// карниз: тёмный низ (тень), светлая грань, яркая верхняя губа
float fT = clamp((fy0 - (fH - fCor)) / fCor, 0.0, 1.0);
float fInCor = (fRoof || fy0 < fH - fCor) ? 0.0 : 1.0;
float fCs = 1.0 - smoothstep(0.16, 0.24, fT);
float fLip = smoothstep(0.78, 0.86, fT);
vec3 fCorCol = fk == 3 ? fWall * 0.55 : (fk == 1 ? fWall * 1.05 : mix(fWall, vec3(0.92, 0.84, 0.68), 0.45));
col = mix(col, fCorCol * (1.0 - 0.5 * fCs) * (1.0 + 0.2 * fLip), fInCor);

// межэтажные тяги (исторические)
float fDb = min(fFy, 1.0 - fFy) * fFh;
float fAa2 = fwidth(fDb) * 0.75 + 1e-3;
float fTy = fInZ * (fk == 2 ? 1.0 : 0.0) * (1.0 - smoothstep(0.10 - 0.5 * fAa2, 0.10 + fAa2, fDb));
col = mix(col, mix(fWall, vec3(0.88, 0.80, 0.62), 0.55), fTy * 0.9);

// рамка окна (платбанд) и стекло
col = mix(col, fk == 2 ? mix(fWall, vec3(0.9, 0.82, 0.65), 0.5) : fWall * 1.15, fFrame);
vec3 fGlassBase = fk == 3 ? fWall * 0.7 : vec3(0.028, 0.040, 0.055);
vec3 fGlass = mix(fGlassBase, uSky * 0.5, fk == 3 ? 0.5 : 0.35 + 0.15 * fR2);
fGlass = mix(fGlass, vec3(0.30, 0.22, 0.15) * (0.6 + 0.4 * fR3), (fk == 3 ? 0.0 : 1.0) * step(0.86, fR3) * 0.7);
#ifdef FACADE_HI
fGlass *= 1.0 - 0.55 * fInnerK;
#endif
col = mix(col, fGlass, fWin);

// крыша
vec3 fRoofCol = mix(vec3(0.085, 0.075, 0.07), vec3(0.15, 0.07, 0.05), step(0.55, fSeed) * (fk == 0 ? 1.0 : 0.4));
col = fRoof ? fRoofCol : col;

// намокание: темнее
col *= 1.0 - 0.38 * uWet;

// снег: крыши по нормали, на стенах — горизонтальные выступы (High/Medium)
float fSnowR = smoothstep(0.02, 0.3, uSnow);
float fSnow = fRoof ? fSnowR : 0.0;
#ifdef FACADE_HI
float fSnowL = smoothstep(0.12, 0.5, uSnow);
float fLedgePl = smoothstep(fPl - 0.3, fPl - 0.2, fy0) * (1.0 - smoothstep(fPl - 0.04, fPl, fy0));
float fSillY = smoothstep(0.5 - fHh - 0.07, 0.5 - fHh - 0.05, fFy) * (1.0 - smoothstep(0.5 - fHh - 0.02, 0.5 - fHh, fFy));
float fSillX = 1.0 - smoothstep(fHw + 0.02, fHw + 0.05, abs(fFx - 0.5));
float fLedge = clamp(fInCor * smoothstep(0.72, 0.84, fT) + fLedgePl * (fRoof ? 0.0 : 1.0) + fInZ * fSillY * fSillX + 0.6 * fTy, 0.0, 1.0);
fSnow = max(fSnow, fLedge * fSnowL);
#endif
col = mix(col, vec3(0.80, 0.84, 0.90), fSnow);

// шероховатость: стена, цоколь грубее, стекло глаже; мокрое глаже; снег матовый
float fRough = fRoof ? 0.92 : 0.84;
fRough = mix(fRough, 0.97, fPlM);
fRough = fk == 3 ? mix(0.35, 0.97, fPlM) : fRough;
fRough = mix(fRough, 0.08, fWin);
fRough = mix(fRough, fRough * 0.35, uWet);
fRough = mix(fRough, 0.95, fSnow);

// ночь: эмиссия горящих окон
float fFrac = (LIT_BASE + LIT_NIGHT * clamp(uNight, 0.0, 1.0)) * (fk == 1 ? OFFICE_LIT : 1.0);
float fLit = fWin * step(fR1, fFrac) * (1.0 - fSnow);
float fSpread = (fR2 - 0.5) * 2.0;
vec3 fLc = mix(vec3(1.0, 0.624, 0.254), fSpread > 0.0 ? vec3(1.0, 0.82, 0.55) : vec3(1.0, 0.45, 0.15), abs(fSpread) * 0.6);
fLc = fk == 1 ? mix(fLc, vec3(0.62, 0.78, 1.0), 0.55) : fLc;
float fGlow = 0.06 + 0.94 * smoothstep(0.12, 0.7, uNight);
vec3 fEmit = fLc * (0.9 + 0.7 * fR3) * fGlow * fLit * (1.0 - 0.35 * fInnerK);

#ifdef FACADE_HI
// рельеф: окна утоплены, рамки, тяги, карниз и цоколь выступают
float fHgt = -0.16 * fWin + 0.05 * fFrame + 0.04 * fTy - 0.03 * fRust + fInCor * 0.3 * smoothstep(0.12, 0.24, fT) + 0.08 * fPlM;
#endif
diffuseColor.rgb = col;
`

const FRAG_BUMP = /* glsl */ `
#ifdef FACADE_HI
{
  vec3 fSx = dFdx(-vViewPosition);
  vec3 fSy = dFdy(-vViewPosition);
  vec3 fR1v = cross(fSy, normal);
  vec3 fR2v = cross(normal, fSx);
  float fDet = dot(fSx, fR1v);
  vec3 fGrad = sign(fDet) * (dFdx(fHgt) * fR1v + dFdy(fHgt) * fR2v);
  vec3 fNb = normalize(abs(fDet) * normal - 0.6 * fGrad);
  normal = fRoof ? normal : fNb;
}
#endif
`

/** Один материал на все дома района. Low — без рельефа и без снега на выступах. */
export function createFacadeMaterial(level: QualityLevel): MeshStandardMaterial {
  const hi = level !== 'low'
  const mat = new MeshStandardMaterial({ roughness: 1, metalness: 0 })
  mat.customProgramCacheKey = () => (hi ? 'facade-hi' : 'facade-lo')
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = facadeUniforms.uWet
    shader.uniforms.uSnow = facadeUniforms.uSnow
    shader.uniforms.uNight = facadeUniforms.uNight
    shader.uniforms.uSky = facadeUniforms.uSky
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}`)
    const head = hi ? '#define FACADE_HI\n' : ''
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `${head}#include <common>\n${fragDecl()}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAG_BUMP}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += fEmit;')
  }
  return mat
}
