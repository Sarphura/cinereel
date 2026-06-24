import { defineConfig } from 'vite'
import path from 'node:path'
import swc from 'unplugin-swc'

export default defineConfig({
  plugins: [swc.vite() as any],
  build: {
    target: 'node18',
    outDir: 'dist',
    ssr: 'src/index.ts',
    rollupOptions: {
      input: 'src/index.ts'
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
