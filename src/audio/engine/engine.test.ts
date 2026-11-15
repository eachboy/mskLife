import { describe, expect, it } from 'vitest'
import { MASTER_LP_HZ } from './AudioMixer'
import { NoiseBurst, type ToneModule, clamp01, daylight, safe } from './audioUtils'

describe('audioUtils / mixer constants', () => {
  it('мастер-lowpass в тёплом диапазоне 6–8 кГц', () => {
    expect(MASTER_LP_HZ).toBeGreaterThanOrEqual(6000)
    expect(MASTER_LP_HZ).toBeLessThanOrEqual(8000)
  })

  it('safe глотает ошибки Tone', () => {
    expect(() => safe(() => { throw new Error('Start time must be strictly greater') })).not.toThrow()
  })

  it('clamp01 и daylight в пределах 0..1', () => {
    expect(clamp01(5)).toBe(1)
    expect(clamp01(-1)).toBe(0)
    for (let m = 0; m < 1440; m += 30) {
      const d = daylight(m)
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(1)
    }
  })

})

/** NoiseBurst с фейковыми голосами: проверяем политику пула без Web Audio. */
function fakeBurst(voices: number, release = 0.1) {
  const log: Array<{ voice: number; kind: 'freq' | 'trig'; time: number }> = []
  const b = Object.create(NoiseBurst.prototype) as NoiseBurst
  const f = b as unknown as Record<string, unknown>
  f.attack = 0.005
  f.release = release
  f.skipped = 0
  f.voices = Array.from({ length: voices }, (_, i) => ({
    filter: { frequency: { setValueAtTime: (_v: number, t: number) => log.push({ voice: i, kind: 'freq', time: t }) } },
    env: { triggerAttackRelease: (_d: number, t: number) => log.push({ voice: i, kind: 'trig', time: t }) },
    lastStart: -Infinity,
    busyUntil: -Infinity,
  }))
  return { b, log }
}

describe('NoiseBurst — пул голосов (причина щелчков в шумовых ударах)', () => {
  it('нечисловое время игнорируется', () => {
    const { b, log } = fakeBurst(2)
    b.hit(Number.NaN, 1, 0.01)
    b.hit(undefined as unknown as number, 1, 0.01)
    b.hit(1.5, 1, 0.01)
    expect(log.filter((e) => e.kind === 'trig')).toHaveLength(1)
    void (null as unknown as ToneModule)
  })

  it('перекрывающиеся удары идут в разные голоса', () => {
    const { b, log } = fakeBurst(3, 0.2)
    b.hit(1.0, 1, 0.01)
    b.hit(1.05, 1, 0.01) // первый ещё звучит
    const trig = log.filter((e) => e.kind === 'trig')
    expect(new Set(trig.map((e) => e.voice)).size).toBe(2)
  })

  it('удар, запланированный раньше уже стоящего, не попадает на тот же голос', () => {
    const { b, log } = fakeBurst(2, 0.05)
    b.hit(2.0, 1, 0.01)
    b.hit(1.9, 1, 0.01) // «из прошлого» относительно первого
    const trig = log.filter((e) => e.kind === 'trig')
    expect(trig[0].voice).not.toBe(trig[1].voice)
  })

  it('частота фильтра не меняется под звучащим хвостом: при занятых голосах удар пропускается', () => {
    const { b, log } = fakeBurst(1, 0.5)
    b.hit(1.0, 1, 0.01, 2000)
    b.hit(1.1, 1, 0.01, 3000) // единственный голос ещё звучит
    expect(log.filter((e) => e.kind === 'freq')).toHaveLength(1)
    expect(b.skipped).toBe(1)
  })

  it('на одном голосе времена стартов строго растут', () => {
    const { b, log } = fakeBurst(2, 0.01)
    for (const t of [1, 1.2, 1.1, 1.4, 1.3, 1.6]) b.hit(t, 1, 0.005)
    const byVoice = new Map<number, number[]>()
    for (const e of log.filter((x) => x.kind === 'trig')) byVoice.set(e.voice, [...(byVoice.get(e.voice) ?? []), e.time])
    for (const times of byVoice.values()) for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1])
  })
})
