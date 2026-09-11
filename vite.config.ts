import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const buildTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
}).format(new Date()).toUpperCase();

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['logo.png', 'robots.txt'],
      manifest: {
        name: '1into1 PDF - Offline Privacy Suite',
        short_name: '1into1 PDF',
        description: 'Zero-upload, 100% in-browser PDF suite that works offline.',
        theme_color: '#fafaf9',
        background_color: '#fafaf9',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // Exclude HTML from precache so browsers ALWAYS fetch the latest index.html
        globPatterns: ['**/*.{html,js,css,ico,png,svg,wasm,mjs}'],
        globIgnores: ['tessdata/**'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Network-First strictly for index.html navigation
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 2,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache heavy local Tesseract models
            urlPattern: ({ url }) => url.pathname.includes('/tessdata/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-offline-data',
              expiration: {
                maxEntries: 12,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('pdf-lib') || id.includes('pdfjs-dist')) {
              return 'pdf-core';
            }
            if (id.includes('tesseract.js')) {
              return 'tesseract-vendor';
            }
            if (id.includes('lucide-react')) {
              return 'ui-icons';
            }
          }
        },
      },
    },
  },
});