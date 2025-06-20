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
    outDir: '../../dist',
    rollupOptions: {
      external: ['electron', 'fs', 'path', 'os', 'child_process', 'crypto', 'util', 'events', 'stream']
    }
  },
  define: {
    // 定义全局变量，避免Node.js变量在浏览器中使用
    global: 'globalThis',
    __dirname: '"."',
    __filename: '"."',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.platform': '"browser"',
    'process.env': '{}',
    process: '{"env": {"NODE_ENV": "development"}, "platform": "browser"}'
  },
  optimizeDeps: {
    exclude: ['electron', 'fs', 'path', 'os', 'child_process', 'crypto', 'util', 'events', 'stream']
  }
})