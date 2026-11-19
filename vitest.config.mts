import { configDefaults, defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
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
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
      '@entities': path.resolve(import.meta.dirname, 'src/entities'),
      '@features': path.resolve(import.meta.dirname, 'src/features'),
      '@widgets': path.resolve(import.meta.dirname, 'src/widgets'),
      '@views': path.resolve(import.meta.dirname, 'src/views'),
      '@content': path.resolve(import.meta.dirname, 'content'),
    },
  },
})
