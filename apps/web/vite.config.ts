import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

import { manifest } from './src/pwa-manifest'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest statt generateSW: der Service Worker bekommt in M7
      // eigene Logik für Background Fetch und den Audio-Cache.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Kein Auto-Reload: eine Aktualisierung mitten in der Wiedergabe wäre
      // genau das, was diese App vermeiden soll. Die UI fragt nach.
      registerType: 'prompt',
      injectRegister: null,
      manifest,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
