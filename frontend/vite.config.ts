import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:5001', changeOrigin: true },
      '/items': { target: 'http://localhost:5001', changeOrigin: true },
      '/login': { target: 'http://localhost:5001', changeOrigin: true },
      '/signup': { target: 'http://localhost:5001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:5001', changeOrigin: true },
    },
  },
})
