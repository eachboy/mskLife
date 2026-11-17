/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 900 },
  test: {
    // Замеры времени (*.perf.test.ts) — отдельным проектом строго после остальных и без параллельных файлов.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/**/*.perf.test.{ts,tsx}', '**/node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'perf',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.perf.test.{ts,tsx}'],
          fileParallelism: false,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
})
