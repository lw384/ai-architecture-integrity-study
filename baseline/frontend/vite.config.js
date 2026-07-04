import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const envDir = resolve(__dirname, '..');
  const env = loadEnv(mode, envDir, '');
  const apiOrigin = env.CRM_BASELINE_API_ORIGIN || 'http://localhost:3101';
  const devPort = Number(env.CRM_BASELINE_FRONTEND_DEV_PORT || 5173);

  return {
    envDir,
    plugins: [react()],
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