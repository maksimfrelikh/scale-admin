/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['.frelikh.dev'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['.frelikh.dev'],
  },
  test: {
    environment: 'jsdom',
    globals: false,
    css: false,
  },
})
