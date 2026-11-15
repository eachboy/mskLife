// Сбор Core Web Vitals для диагностики (dev или ?perf). Значения: window.__vitals — читает scripts/qa-report.mjs.
// Внешним сервисам ничего не отправляется.
import type { Metric } from 'web-vitals'

export type VitalsMap = Partial<Record<Metric['name'], { value: number; rating: Metric['rating'] }>>

export async function installVitals() {
  const store: VitalsMap = {}
  ;(window as unknown as { __vitals: VitalsMap }).__vitals = store
  const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import('web-vitals')
  const put = (m: Metric) => {
    store[m.name] = { value: Math.round(m.value * 1000) / 1000, rating: m.rating }
  }
  const opts = { reportAllChanges: true }
  onCLS(put, opts)
  onFCP(put, opts)
  onINP(put, opts)
  onLCP(put, opts)
  onTTFB(put, opts)
}
