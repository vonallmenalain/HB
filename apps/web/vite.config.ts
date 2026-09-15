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
    rollupOptions: {
      output: {
        // Firebase und React getrennt halten. Der Service Worker legt jede
        // Datei einzeln in den Precache – ändert sich nur App-Code, muss das
        // Gerät nicht das gesamte Firebase-Paket erneut laden.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/@firebase/') || id.includes('/firebase/')) return 'firebase'
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/scheduler/')
          ) {
            return 'react'
          }
          return undefined
        },
      },
    },
  },
})
