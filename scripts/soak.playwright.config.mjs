// Playwright-конфиг для lifecycle/viewport-тестов на ИЗОЛИРОВАННОЙ production-сборке (не мешает HMR dev-сервера).
//   npx vite build --outDir D:/dev-cache/tmp/mlsoak --emptyOutDir
//   npx playwright test -c scripts/soak.playwright.config.mjs
// Порт/каталог: SOAK_PORT (5196), SOAK_DIST (D:/dev-cache/tmp/mlsoak).
import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

const port = Number(process.env.SOAK_PORT ?? 5196)
const dist = process.env.SOAK_DIST ?? 'D:/dev-cache/tmp/mlsoak'
const gpu = ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
const edge = existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') || existsSync('C:/Program Files/Microsoft/Edge/Application/msedge.exe')

export default defineConfig({
  testDir: '../e2e',
  testMatch: /lifecycle.*\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}`, viewport: { width: 1440, height: 810 }, launchOptions: { args: gpu } },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    ...(edge ? [{ name: 'msedge', use: { browserName: 'chromium', channel: 'msedge' } }] : []),
  ],
  webServer: { command: `npx vite preview --outDir ${dist} --port ${port} --strictPort`, url: `http://localhost:${port}`, reuseExistingServer: true, timeout: 60_000 },
})
