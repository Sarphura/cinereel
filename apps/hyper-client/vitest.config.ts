import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['test/**/*.spec.ts', 'test/**/*.test.ts', 'test/**/*.e2e-spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
  },
})
