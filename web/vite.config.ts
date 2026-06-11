import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Слушаем IPv4-loopback явно: некоторые VPN перехватывают DNS, и имя
    // localhost перестаёт резолвиться — обращение к 127.0.0.1 минует DNS.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // HMR-websocket тоже привязываем к IP, иначе живая перезагрузка молчит под VPN.
    hmr: { host: '127.0.0.1' },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
