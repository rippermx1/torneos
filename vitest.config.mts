import { configDefaults, defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    // Historical audit reproductions and generated outputs are not regressions.
    exclude: [...configDefaults.exclude, 'artifacts/**'],
    coverage: {
      provider: 'v8',
      include: ['lib/game/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
})
