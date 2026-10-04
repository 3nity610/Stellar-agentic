import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

// Whole-package coverage for the Codecov report. Informational only: the
// 100% gate on src/math lives in vitest.config.ts (`pnpm test:coverage`) and
// is unaffected by this file. The coverage block is replaced rather than
// merged so the math-only include and thresholds do not carry over, and it
// writes to its own directory so the two runs never overwrite each other.
export default defineConfig({
  test: {
    ...baseConfig.test,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage-full',
      // Report even when a test fails, so the PR still shows coverage.
      reportOnFailure: true,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/__tests__/**', 'src/generated/**'],
    },
  },
});
