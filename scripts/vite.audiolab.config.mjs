// Сборка изолированной аудио-лаборатории (только src/audio + audio-lab.html), без HMR и сцен.
// Используется: node scripts/audio-lab.mjs --build
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  root,
  logLevel: 'warn',
  build: {
    outDir: 'D:/dev-cache/tmp/audiolab-build',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: fileURLToPath(new URL('../audio-lab.html', import.meta.url)) },
  },
  preview: { port: 5192, strictPort: true },
})
