import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  const disableHmr = process.env.DISABLE_HMR === 'true';

  return {
    plugins: [
      ...(disableHmr
        ? [
            {
              name: 'disable-vite8-client-ws-when-hmr-off',
              apply: 'serve' as const,
              enforce: 'post' as const,
              transform(code: string, id: string) {
                if (
                  id.includes('vite/dist/client/client.mjs') ||
                  code.includes('const createWebSocketModuleRunnerTransport = (options) => {')
                ) {
                  return {
                    code: code
                      .replace(
                        'const createWebSocketModuleRunnerTransport = (options) => {',
                        'const createWebSocketModuleRunnerTransport = (_options) => ({ connect() {}, disconnect() {}, send() {} }); const _unusedCreateWsTransport = (options) => {'
                      )
                      .replace(
                        'setupForwardConsoleHandler(transport, forwardConsole);',
                        '/* ForwardConsole disabled when DISABLE_HMR=true */'
                      ),
                    map: null,
                  };
                }
                return null;
              },
            },
          ]
        : []),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        devOptions: {
          enabled: true,
          type: 'module',
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallbackDenylist: [/^\/api\//],
        },
        manifest: {
          id: '/',
          name: 'Boletín UVEH — Vigilancia Epidemiológica',
          short_name: 'RADAR UVEH',
          description:
            'Plataforma operativa de vigilancia epidemiológica hospitalaria (UVEH) para detección de IAAS, lectura inteligente de cultivos y antibiogramas, notas clínicas por voz e informes CODECIN.',
          theme_color: '#0F766E',
          background_color: '#F8FAFC',
          display: 'standalone',
          orientation: 'any',
          scope: '/',
          start_url: '/',
          lang: 'es-MX',
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
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      ws: process.env.DISABLE_HMR === 'true' ? (false as const) : undefined,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
