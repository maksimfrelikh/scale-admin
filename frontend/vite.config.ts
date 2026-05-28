/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['maksimfrelikh.ru', 'www.maksimfrelikh.ru', 'staging.maksimfrelikh.ru'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['maksimfrelikh.ru', 'www.maksimfrelikh.ru', 'staging.maksimfrelikh.ru'],
  },
  test: {
    environment: 'jsdom',
    globals: false,
    css: false,
  },
})
