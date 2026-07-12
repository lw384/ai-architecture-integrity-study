import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const rootEnvDir = resolve(__dirname, '..');
  const env = loadEnv(mode, rootEnvDir, '');
  const apiOrigin = env.CRM_BASELINE_API_ORIGIN || 'http://localhost:3101';
  const devPort = Number(env.CRM_BASELINE_FRONTEND_DEV_PORT || 5173);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        api: resolve(__dirname, 'src/api'),
        assets: resolve(__dirname, 'src/assets'),
        components: resolve(__dirname, 'src/components'),
        config: resolve(__dirname, 'src/config.js'),
        contexts: resolve(__dirname, 'src/contexts'),
        hooks: resolve(__dirname, 'src/hooks'),
        layout: resolve(__dirname, 'src/layout'),
        'menu-items': resolve(__dirname, 'src/menu-items'),
        mock: resolve(__dirname, 'mock'),
        pages: resolve(__dirname, 'src/pages'),
        routes: resolve(__dirname, 'src/routes'),
        sections: resolve(__dirname, 'src/sections'),
        themes: resolve(__dirname, 'src/themes'),
        utils: resolve(__dirname, 'src/utils')
      }
    },
    server: {
      port: devPort,
      proxy: {
        '/api': {
          target: apiOrigin,
          changeOrigin: true,
        },
      },
    },
  };
});