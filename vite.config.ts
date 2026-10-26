import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  loadEnv(mode, '.', '');
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
          'widget-template.json',
          'widget-data.json',
        ],
        manifest: {
          id: '/',
          name: 'Arcane Chess 3D',
          short_name: 'Arcane Chess 3D',
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
          iarc_rating_id: 'e84b072d-71b3-4d3e-86ae-31a8ce4e53b7',
          categories: ['games', 'board', 'strategy', 'entertainment'],
          prefer_related_applications: false,
          related_applications: [
            {
              platform: 'play',
              url: 'https://play.google.com/store/apps/details?id=com.wizardchess3d.sanctum',
              id: 'com.wizardchess3d.sanctum',
            },
          ],
          scope_extensions: [
            {
              origin: 'https://vantergo-f99acfc00312.herokuapp.com',
            },
          ],
          handle_links: 'preferred',
          launch_handler: {
            client_mode: ['navigate-existing', 'auto'],
          },
          edge_side_panel: {
            preferred_width: 480,
          },
          note_taking: {
            new_note_url: '/?note=true',
          },
          share_target: {
            action: '/',
            method: 'GET',
            enctype: 'application/x-www-form-urlencoded',
            params: {
              title: 'title',
              text: 'text',
              url: 'url',
            },
          },
          file_handlers: [
            {
              action: '/',
              accept: {
                'application/x-chess-pgn': ['.pgn'],
                'text/plain': ['.pgn', '.fen'],
              },
            },
          ],
          protocol_handlers: [
            {
              protocol: 'web+wizardchess',
              url: '/?match=%s',
            },
          ],
          widgets: [
            {
              name: 'Arcane Chess 3D Quick Match',
              description: 'Jump straight into a 3D Gothic Sanctum chess duel.',
              tag: 'wizard-chess-quick-match',
              ms_ac_template: '/widget-template.json',
              data: '/widget-data.json',
              type: 'application/json',
              screenshots: [
                {
                  src: '/screenshot-wide.png',
                  sizes: '1280x720',
                  label: 'Arcane Chess 3D Widget Preview',
                },
              ],
              icons: [
                {
                  src: '/pwa-192x192.png',
                  sizes: '192x192',
                },
              ],
              auth: false,
              update: 86400,
            },
          ],
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
              label: 'Arcane Chess 3D Gothic Cathedral Board View',
            },
            {
              src: '/screenshot-narrow.png',
              sizes: '720x1280',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Arcane Chess 3D Mobile Gameplay View',
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
        } as Record<string, unknown>,
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
