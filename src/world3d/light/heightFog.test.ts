import { describe, expect, it } from 'vitest'
import { ShaderChunk } from 'three'
import { FOG_FLOOR, installHeightFog } from './heightFog'

describe('heightFog', () => {
  it('патчит чанки один раз и сохраняет штатные варианты тумана', () => {
    const chunks: Record<string, string> = {
      fog_vertex: ShaderChunk.fog_vertex,
      fog_pars_vertex: ShaderChunk.fog_pars_vertex,
      fog_pars_fragment: ShaderChunk.fog_pars_fragment,
      fog_fragment: ShaderChunk.fog_fragment,
    }
    expect(installHeightFog(chunks)).toBe(true)
    expect(installHeightFog(chunks)).toBe(false)
    expect(chunks.fog_vertex).toContain('vFogH')
    expect(chunks.fog_pars_vertex).toContain('varying float vFogH')
    expect(chunks.fog_pars_fragment.match(/varying float vFogH/g)?.length).toBe(1)
    expect(chunks.fog_fragment).toContain('fogNear')
    expect(chunks.fog_fragment).toContain('fogAvg')
    expect(FOG_FLOOR).toBeGreaterThan(0)
    expect(FOG_FLOOR).toBeLessThan(1)
  })
})
