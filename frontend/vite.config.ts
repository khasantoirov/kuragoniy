import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered manually in main.tsx so a deployed update takes over
      // already-open tabs immediately instead of silently updating in the
      // background while the visible page keeps running the old bundle.
      injectRegister: false,
      // Custom worker (src/sw.ts) instead of the auto-generated one, so it
      // can also handle 'push'/'notificationclick' for Web Push — the
      // caching rules below are otherwise identical to the old generateSW
      // config, just written by hand as workbox-routing calls.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
      manifest: {
        name: 'STEM LMS · Muhandis_D laboratoriyasi',
        short_name: 'STEM LMS',
        lang: 'uz',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: '#12212E',
        background_color: '#12212E',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
    },
  },
})
