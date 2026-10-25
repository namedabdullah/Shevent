import { defineConfig } from 'vitest/config';

// Unit tests for pure helpers in lib/ (no React, no Next.js runtime). E2E lives in tests/e2e.
export default defineConfig({
  test: { include: ['lib/**/*.test.ts'] },
});
