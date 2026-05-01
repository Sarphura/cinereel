import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'node18',
    outDir: 'dist',
    ssr: 'src/index.ts',
    rollupOptions: {
      input: 'src/index.ts'
    }
  }
})
