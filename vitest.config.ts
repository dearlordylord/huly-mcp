import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.test.ts',
        '**/*.config.ts',
        'src/globals.d.ts',
        'src/reset.d.ts',
        'src/domain/schemas.ts',
        'src/domain/schemas/index.ts',
        'src/index.ts',
        'src/polyfills.ts',
        'src/version.ts',
      ],
      // Final gate: keep all coverage metrics at or above 99%.
      thresholds: {
        lines: 99,
        functions: 99,
        branches: 99,
        statements: 99,
      },
    },
  },
})
