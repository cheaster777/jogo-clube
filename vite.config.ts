import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt" keeps the new worker waiting until the player accepts the
      // update. Activating it mid-match would drop the lazy chunks that the
      // running page still needs.
      registerType: 'prompt',
      injectRegister: false,
      // The manifest lives in public/manifest.json and is linked by index.html.
      manifest: false,
      workbox: {
        // Card images (5 MB) are cached on first use to spare mobile data.
        globPatterns: ['**/*.{js,css,html}', 'assets/icons/*.png'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/health\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ sameOrigin, url }) =>
              sameOrigin && url.pathname.startsWith('/assets/images/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-images',
              expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/health': 'http://127.0.0.1:4000',
    },
  },
});
