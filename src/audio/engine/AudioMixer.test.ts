import { describe, expect, it, vi } from 'vitest'
import { AudioMixer } from './AudioMixer'
import type { ToneModule } from './audioUtils'

/** Минимальный фейк Tone: достаточно, чтобы построить граф микшера и увидеть вызовы setContext. */
function fakeTone() {
  const setContext = vi.fn()
  class Node {
    gain = { rampTo: vi.fn() }
    frequency = { setTargetAtTime: vi.fn() }
    oversample = ''
    connect() {
      return this
    }
    chain() {
      return this
    }
    toDestination() {
      return this
    }
    dispose() {
      return this
    }
  }
  const raw = { state: 'running', createAnalyser: () => ({ connect() {}, disconnect() {} }) }
  class Context {
    rawContext = raw
    currentTime = 0
    transport = { stop: () => ({ cancel() {} }) }
    dispose() {
      return this
    }
  }
  const T = { Gain: Node, Filter: Node, Compressor: Node, WaveShaper: Node, Context, setContext } as unknown as ToneModule
  return { T, setContext }
}

describe('AudioMixer — один AudioContext (B-11)', () => {
  it('делает свой контекст текущим и закрывает контекст Tone по умолчанию (disposeOld = true)', () => {
    const { T, setContext } = fakeTone()
    const m = new AudioMixer(T)
    expect(setContext).toHaveBeenCalledTimes(1)
    expect(setContext).toHaveBeenCalledWith(m.context, true)
  })

  it('если закрытие старого контекста упало — свой контекст всё равно становится текущим', () => {
    const { T, setContext } = fakeTone()
    setContext.mockImplementationOnce(() => {
      throw new Error('double dispose')
    })
    const m = new AudioMixer(T)
    expect(setContext).toHaveBeenCalledTimes(2)
    expect(setContext).toHaveBeenLastCalledWith(m.context)
  })
})
