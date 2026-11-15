import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './index.css'
import { installDevHooks } from './app/devHooks'

if (import.meta.env.DEV) installDevHooks()
if (import.meta.env.DEV || location.search.includes('perf')) void import('./app/vitals').then((m) => m.installVitals())
if (import.meta.env.DEV || location.search.includes('audiodebug')) {
  ;(window as unknown as { __audioLab: unknown }).__audioLab = {
    renderOffline: async (sc: unknown) => (await import('./audio/diagnostics/audioLab')).renderOffline(sc as never),
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
