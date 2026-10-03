import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { defineConfig } from 'vite'

// Separate build for the town (frontend/town.html).
//
// The town runs in an opaque-origin sandboxed iframe. Module script
// fetches from an opaque origin are CORS-blocked, so town.html must be
// a SINGLE self-contained file: viteSingleFile inlines the entire bundle
// (JS + CSS) into the HTML. No external fetches, no CORS issue.
//
// Built via: npx vite build --config vite.town.config.ts
// Output merges into dist/ alongside the main build (emptyOutDir: false).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: "town.html",
    },
  },
})
