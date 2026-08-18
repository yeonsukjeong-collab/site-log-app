import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const hasLocalCert = fs.existsSync('./.certs/key.pem') && fs.existsSync('./.certs/cert.pem')
  const https = command === 'serve' && hasLocalCert
    ? { key: fs.readFileSync('./.certs/key.pem'), cert: fs.readFileSync('./.certs/cert.pem') }
    : undefined

  return {
    plugins: [react()],
    server: {
      host: true,
      https,
    },
  }
})
