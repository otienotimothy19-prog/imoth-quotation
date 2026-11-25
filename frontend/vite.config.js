import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Content-Security-Policy for the built site: only this site's own scripts
// may run, the page can only talk to its own API, and plugins/foreign forms
// are blocked -- so an injected script can't run or send login tokens
// elsewhere. Production builds only: Vite's dev server needs inline scripts.
function contentSecurityPolicy(apiBaseUrl) {
  let apiOrigin = ''
  try {
    apiOrigin = apiBaseUrl ? new URL(apiBaseUrl).origin : ''
  } catch {
    apiOrigin = ''
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'imoth-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), contentSecurityPolicy(env.VITE_API_BASE_URL)],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
