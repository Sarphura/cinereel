import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@hyper.api': fileURLToPath(new URL('./src/hyper.api', import.meta.url)),
      '@hyper.infrastructure': fileURLToPath(
        new URL('./src/hyper.infrastructure', import.meta.url),
      ),
      '@hyper.implementation': fileURLToPath(
        new URL('./src/hyper.implementation', import.meta.url),
      ),
    },
  },
  test: {
    include: ['test/**/*.spec.ts', 'test/**/*.test.ts', 'test/**/*.e2e-spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
  },
})
