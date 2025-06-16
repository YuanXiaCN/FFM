import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  root: 'src/renderer',
  base: './', // 重要：设置相对路径
  resolve: {
    alias: {
      '@': path.resolve('src/renderer'),
      '@views': path.resolve('src/views'),
      '@shared': path.resolve('src/shared'),
      '@services': path.resolve('src/services')
    }
  },
  build: {
    outDir: '../../dist'
  }
})