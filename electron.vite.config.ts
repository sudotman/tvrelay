import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const sharedAlias = path.resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': sharedAlias
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs'
        }
      }
    },
    resolve: {
      alias: {
        '@shared': sharedAlias
      }
    }
  },
  renderer: {
    plugins: [react()],
    server: {
      port: 4174
    },
    resolve: {
      alias: {
        '@shared': sharedAlias,
        '@renderer': path.resolve(__dirname, 'src/renderer/src')
      }
    }
  }
})
