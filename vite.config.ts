import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts', 
      },
      {
        entry: 'src/main/preload.ts',
        onstart({ reload }) {
          reload()
        },
      },
    ]),
    renderer(),
  ],
  server: {
    watch: {
      // Don't watch build-output folders. They contain thousands of
      // files that Vite mistakes for source code, triggering reloads
      // that restart Electron and break the dev environment. These
      // entries are added to Vite's default ignores (node_modules,
      // .git), not replacing them.
      ignored: [
        '**/.venv/**',
        '**/.venv-build/**',
        '**/build/**',
        '**/dist/**',
        '**/dist-electron/**',
        '**/python-dist/**',
        '**/release/**',
      ],
    },
  },
})