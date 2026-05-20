import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// ─────────────────────────────────────────────────────────────────
// HTTPS local
// ─────────────────────────────────────────────────────────────────
// Si vous avez généré un certificat de confiance via mkcert :
//   mkcert -install
//   mkcert -key-file key.pem -cert-file cert.pem 192.168.12.104 localhost
// → on l'utilise (aucun warning navigateur, XHR fiable).
// Sinon on retombe sur basicSsl() qui génère un cert auto-signé
// (warning navigateur "Not secure", XHR parfois bloqué sur Edge).
// WebAuthn exige un contexte sécurisé : HTTPS ou localhost uniquement.
const certPath = path.resolve(__dirname, 'cert.pem')
const keyPath  = path.resolve(__dirname, 'key.pem')
const hasMkcert = fs.existsSync(certPath) && fs.existsSync(keyPath)

const httpsConfig = hasMkcert
  ? { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }
  : true

export default defineConfig({
  plugins: [react(), ...(hasMkcert ? [] : [basicSsl()])],
  server: {
    https: httpsConfig,
    host: true,    // écoute sur 0.0.0.0 → accessible depuis le LAN
    port: 5173,
    // Autorise les tunnels ngrok / Cloudflare en plus du LAN.
    // 'all' = pas de check Host header → on évite l'erreur "Invalid Host".
    allowedHosts: ['localhost', '.ngrok-free.dev', '.ngrok.app', '.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
