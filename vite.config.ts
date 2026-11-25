import { defineConfig } from 'vitest/config';

// base './' keeps the build deployable to any static host / sub-path.
export default defineConfig({
  base: './',
  test: { include: ['src/**/*.test.ts'] },
});
