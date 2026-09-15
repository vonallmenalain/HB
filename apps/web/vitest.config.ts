import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Das vite-plugin-pwa läuft im Test nicht mit; sein virtuelles Modul
      // wird durch einen Stub ersetzt.
      'virtual:pwa-register': fileURLToPath(
        new URL('./src/test/virtual-pwa-register.ts', import.meta.url),
      ),
    },
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
