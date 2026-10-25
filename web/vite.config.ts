import { defineConfig } from 'vite';
export default defineConfig({
  server: { host: '127.0.0.1', strictPort: true, port: 5173, proxy: {
    '/api': 'http://127.0.0.1:4317', '/healthz': 'http://127.0.0.1:4317', '/openapi.json': 'http://127.0.0.1:4317',
  } },
  build: { target: 'es2022' },
});
