import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  base: '/', 
  build: {
    outDir: 'dist', 
    emptyOutDir: true,
  },
  plugins: [
    // TanStack Router 插件通常需要放在 React 之前
    tanstackRouter(), 
    tailwindcss(),
    react(),
  ],
})
