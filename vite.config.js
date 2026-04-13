import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
    include: ['echarts', 'echarts-for-react']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'maplibre': ['maplibre-gl'],
          'deck': ['@deck.gl/react', '@deck.gl/layers', '@deck.gl/core'],
          'echarts': ['echarts', 'echarts-for-react'],
        }
      }
    }
  }
})
