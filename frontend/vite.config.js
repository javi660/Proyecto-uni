import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000';

  // El navegador siempre llama a "/api" en su propio origen; Vite reenvía al backend.
  // Así las cookies HttpOnly de sesión (Fase 3) funcionan sin problemas entre orígenes.
  const proxy = {
    '/api': {
      target: apiTarget,
      changeOrigin: false,
    },
  };

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
      css: false,
      include: ['src/**/*.test.{js,jsx}'],
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy,
    },
    preview: {
      port: 4173,
      proxy,
    },
  };
});
