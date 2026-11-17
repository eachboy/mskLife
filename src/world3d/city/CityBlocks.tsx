/**
 * Дома района: один слитый BufferGeometry на тайл, один материал, один <mesh> (План §4, инвариант 5).
 * Цвет, окна, цоколь, карниз, ночь — в фасадном шейдере (facadeMaterial.ts) по атрибутам aUv/aHeight/aSeed/aKind.
 * Координаты меша — метры относительно центра района (parseCityTile).
 */
import { useEffect, useMemo, useState } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import { effectiveQuality, useWorldStore } from '../../stores/worldStore'
import { type CityTile, parseCityTile } from './cityTiles'
import { createFacadeMaterial } from './facadeMaterial'

/** Состояние тайла для окна замеров (window.__gl читает World3D). */
export interface CityDebug {
  tileMs: number
  tileError: string
}
export const cityDebug: CityDebug = { tileMs: 0, tileError: '' }

function reportCity(patch: Partial<CityDebug>): void {
  Object.assign(cityDebug, patch)
  const gl = typeof window === 'undefined' ? undefined : (window as unknown as { __gl?: Partial<CityDebug> }).__gl
  if (gl) Object.assign(gl, patch)
}

/** Чистая сборка геометрии из разобранного тайла. Массивы не копируются. */
export function buildCityGeometry(tile: CityTile): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(tile.positions, 3))
  g.setAttribute('aUv', new BufferAttribute(tile.uvs, 2))
  g.setAttribute('aHeight', new BufferAttribute(tile.aHeight, 1))
  g.setAttribute('aSeed', new BufferAttribute(tile.aSeed, 1))
  g.setAttribute('aKind', new BufferAttribute(tile.aKind, 1))
  g.setIndex(new BufferAttribute(tile.indices, 1))
  g.computeVertexNormals()
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

interface Props {
  district: string
  /** Дома отбрасывают и принимают тени (по уровню качества). */
  shadows: boolean
}

export default function CityBlocks({ district, shadows }: Props) {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null)
  const level = useWorldStore((s) => effectiveQuality(s))
  const material = useMemo(() => createFacadeMaterial(level), [level])

  useEffect(() => {
    const ctl = new AbortController()
    let built: BufferGeometry | null = null
    fetch(`/city/${district}.bin`, { signal: ctl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.arrayBuffer()
      })
      .then((buf) => {
        const t0 = performance.now()
        built = buildCityGeometry(parseCityTile(buf))
        reportCity({ tileMs: performance.now() - t0, tileError: '' })
        setGeometry(built)
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return
        reportCity({ tileError: e instanceof Error ? e.message : 'tile load failed' })
      })
    return () => {
      ctl.abort()
      built?.dispose()
      setGeometry(null)
    }
  }, [district])

  useEffect(() => () => material.dispose(), [material])

  if (!geometry) return null
  return <mesh geometry={geometry} material={material} castShadow={shadows} receiveShadow={shadows} />
}
