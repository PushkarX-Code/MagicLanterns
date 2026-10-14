import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

const shared = { '@shared': resolve('src/shared') }

// Release builds are minified with no source maps, so the shipped app carries no readable source.
const build = { minify: true, sourcemap: false }

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'MAIN_VITE_'), ...process.env }
  const proxy = env.MAIN_VITE_META_PROXY_URL ?? ''
  // With a proxy the keys stay on the server; otherwise they're built in, scrambled with a per-build pad.
  const pad = [...randomBytes(32)]
  const scramble = (s = ''): number[] => (proxy ? [] : [...Buffer.from(s)].map((c, i) => c ^ pad[i % pad.length]))
  const keys = { tmdb: scramble(env.MAIN_VITE_TMDB_API_KEY), omdb: scramble(env.MAIN_VITE_OMDB_API_KEY), pad }

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      resolve: { alias: shared },
      define: { __META_PROXY__: JSON.stringify(proxy), __META_KEYS__: JSON.stringify(keys) },
      build
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      resolve: { alias: shared },
      build
    },
    renderer: {
      resolve: {
        alias: { ...shared, '@': resolve('src/renderer/src') }
      },
      plugins: [react()],
      define: { __APP_VERSION__: JSON.stringify(pkg.version) },
      build
    }
  }
})
