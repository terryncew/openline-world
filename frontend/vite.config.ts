import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// https://vite.dev/config/
//
// Same-origin API path for the phone-accessible preview: the browser only
// ever talks to this dev server. /api/* is proxied server-side to the
// workshop backend, which stays bound to 127.0.0.1 (loopback only) and
// keeps its loopback-only CORS policy. No backend port is exposed to the
// LAN; the phone reaches everything through this one origin.
//
// PREVIEW_HTTPS=1 enables a self-signed certificate (dev only). Plain HTTP
// over a LAN IP is not a secure context, so WebCrypto (which the signed
// join requires) is unavailable there — HTTPS is what makes signing work
// on the phone. The phone will warn about the untrusted certificate once;
// that warning is expected and must be accepted explicitly on the device.
const useHttps = process.env.PREVIEW_HTTPS === '1'

// The dev proxy target follows the backend's env-configurable port
// (WORKSHOP_PORT), defaulting to 8471. Additive: the default path is
// unchanged; demo backends run on a different port.
const backendPort = process.env.WORKSHOP_PORT ?? '8471'

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    // Dev-only: the phone reaches this server via the machine's LAN IP or
    // hostname, which varies per network — so host checking is off here.
    // The backend behind the proxy stays loopback-only regardless.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: false,
      },
    },
  },
})
