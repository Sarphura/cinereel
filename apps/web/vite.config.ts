import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig(({ mode }) => {
  const servicePort = mode === 'peer' ? 3001 : 3000;

  return {
    base: '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      proxy: {
        '/api': {
          target: `http://localhost:${servicePort}`,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
    plugins: [
      // TanStack Router 插件通常需要放在 React 之前
      tanstackRouter(),
      tailwindcss(),
      react(),
    ],
  };
})
