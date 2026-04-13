import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    environmentMatchGlobs: [
      ['test/renderer/**', 'jsdom'],
    ],
  },
})