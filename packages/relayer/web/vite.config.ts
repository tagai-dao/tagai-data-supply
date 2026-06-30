import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 构建产物输出到 relayer 静态目录，由 relayer 托管
export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: '../src/admin/public',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    // 开发时把 /admin 与 /node API 代理到 relayer
    proxy: {
      '/admin': 'http://127.0.0.1:7701',
      '/node': 'http://127.0.0.1:7701',
    },
  },
});
