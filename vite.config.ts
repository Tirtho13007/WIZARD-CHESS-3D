import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'screenshot-wide.png',
          'screenshot-narrow.png',
          'privacy-policy.html',
        ],
        manifest: {
          id: '/',
          name: 'WIZARD CHESS 3D',
          short_name: 'WizardChess',
          description:
            'Interactive 3D Gothic Cathedral Wizard Chess with sculpted stone pieces, cinematic melee captures, stone shatter physics, and single-player AI.',
          theme_color: '#080a0f',
          background_color: '#080a0f',
          display: 'fullscreen',
          display_override: ['fullscreen', 'standalone', 'window-controls-overlay'],
          orientation: 'landscape',
          start_url: '/',
          scope: '/',
          lang: 'en',
          dir: 'ltr',
          categories: ['games', 'board', 'strategy', 'entertainment'],
          prefer_related_applications: false,
          launch_handler: {
            client_mode: ['navigate-existing', 'auto'],
          },
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          screenshots: [
            {
              src: '/screenshot-wide.png',
              sizes: '1280x720',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Wizard Chess 3D Gothic Cathedral Board View',
            },
            {
              src: '/screenshot-narrow.png',
              sizes: '720x1280',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Wizard Chess 3D Mobile Gameplay View',
            },
          ],
          shortcuts: [
            {
              name: 'Play as White',
              short_name: 'Play White',
              description: 'Start a new match in the Gothic Sanctum as White',
              url: '/?side=white',
              icons: [
                {
                  src: '/pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
              ],
            },
            {
              name: 'Play as Black',
              short_name: 'Play Black',
              description: 'Start a new match in the Gothic Sanctum as Black',
              url: '/?side=black',
              icons: [
                {
                  src: '/pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
              ],
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,b64,json}'],
          runtimeCaching: [
            {
              urlPattern: /\/assets\/glb\/.*\.b64$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'wizard-chess-3d-models-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve('./src'),
      },
    },
  };
});
