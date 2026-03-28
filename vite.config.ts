import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/teller-api': {
        target: 'https://api.teller.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/teller-api/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const tellerToken = req.headers['x-teller-token'] as string;
            proxyReq.removeHeader('authorization');
            proxyReq.removeHeader('x-teller-token');
            if (tellerToken) {
              proxyReq.setHeader('Authorization', 'Basic ' + Buffer.from(tellerToken + ':').toString('base64'));
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  publicDir: 'public',
})

