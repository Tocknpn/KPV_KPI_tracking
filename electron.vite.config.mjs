import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))
const APP_VERSION = pkg.version

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/preload.ts'),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html'),
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    plugins: [react()],
  },
})
