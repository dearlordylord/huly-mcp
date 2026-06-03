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
      // Ratcheted upward as coverage improves; never lowered. Target is 99
      // across the board. Current floor is set at/below the measured numbers so
      // `check-all` stays green while we raise tests toward the goal.
      thresholds: {
        lines: 93,
        functions: 93,
        branches: 82,
        statements: 93,
      },
    },
  },
})
