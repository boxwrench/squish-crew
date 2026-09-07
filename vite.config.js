// vite.config.js
import { defineConfig } from 'vite'

// GitHub Pages serves this project site under /squish-crew/, so built asset URLs
// need that prefix. Dev keeps the root base: scripts/preview-check.mjs and the
// LAN dev server both expect http://host:5173/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/squish-crew/' : '/',
  server: {
    allowedHosts: true
  }
}))
