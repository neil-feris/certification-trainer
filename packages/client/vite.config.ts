import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: false, // We'll create manifest.json manually in US-015
      workbox: {
        // Cache HTML, CSS, JS, and font files with cache-first strategy
        runtimeCaching: [
          {
            // Cache-first for static assets (JS, CSS, fonts, images)
            urlPattern: /\.(?:js|css|woff2?|ttf|otf|eot|png|jpg|jpeg|gif|svg|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ace-prep-static-assets',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Cache-first for the app shell (HTML)
            urlPattern: /^https?:\/\/[^/]+\/(?:index\.html)?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ace-prep-app-shell',
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
          {
            // Network-first for API calls with offline fallback
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ace-prep-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
        // Pre-cache important app files
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Skip waiting and claim clients immediately
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false, // Disable in development to avoid caching issues
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
