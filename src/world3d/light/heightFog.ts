/**
 * Высотный туман (План §5 «Погода»: «Туман — высотный, цвет из неба»): экспоненциальный по высоте слой поверх
 * штатного FogExp2 three. Патчится один раз глобально (ShaderChunk fog_*), поэтому действует на все материалы
 * с `fog: true` (фасады, земля, фонари) без правки их шейдеров; шейдеры с `fog: false` (небо, молния) не затронуты.
 * Плотность на высоте h: d(h) = d0 · (FLOOR + (1 − FLOOR) · exp(−h / H)); вдоль луча камера → фрагмент берётся
 * аналитическое среднее экспоненты, поэтому слой у земли плотнее, а верх высоток и дали над крышами — прозрачнее.
 * Цвет и d0 — по-прежнему `worldLight.fogColor/fogDensity` (World3D пишет их в FogExp2).
 */
import { ShaderChunk } from 'three'

// ───────── Числа (не из Плана: План задаёт лишь «высотный»; подобраны по кадрам) ─────────
/** Высота слоя, м: на ней плотность падает в e раз (без учёта пола). */
export const FOG_SCALE_HEIGHT_M = 70
/** Доля плотности, не зависящая от высоты (общая дымка на любой высоте). */
export const FOG_FLOOR = 0.35

const MARK = '/*heightFog*/'
const f = (x: number): string => x.toFixed(4)

const PARS_VERT = `
#ifdef USE_FOG
	varying float vFogDepth;
	varying float vFogH;
#endif
`
const VERT = `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogH = cameraPosition.y + dot( viewMatrix[ 1 ].xyz, mvPosition.xyz );
#endif
`
const PARS_FRAG_EXTRA = `
#ifdef USE_FOG
	varying float vFogH;
#endif
`
const FRAG = `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogK = ${f(1 / FOG_SCALE_HEIGHT_M)};
		float fogH0 = max( cameraPosition.y, 0.0 );
		float fogH1 = max( vFogH, 0.0 );
		float fogDh = fogH1 - fogH0;
		float fogAvg = abs( fogDh ) < 0.5 ? exp( - fogK * fogH0 ) : ( exp( - fogK * fogH0 ) - exp( - fogK * fogH1 ) ) / ( fogK * fogDh );
		float fogD = fogDensity * ( ${f(FOG_FLOOR)} + ${f(1 - FOG_FLOOR)} * fogAvg );
		float fogFactor = 1.0 - exp( - fogD * fogD * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`

/** Заменяет чанки тумана three; повторный вызов ничего не делает. Возвращает true, если патч применён сейчас. */
export function installHeightFog(chunks: Record<string, string> = ShaderChunk): boolean {
  if (chunks.fog_vertex.includes(MARK)) return false
  chunks.fog_pars_vertex = MARK + PARS_VERT
  chunks.fog_vertex = MARK + VERT
  chunks.fog_pars_fragment = chunks.fog_pars_fragment + PARS_FRAG_EXTRA
  chunks.fog_fragment = MARK + FRAG
  return true
}
