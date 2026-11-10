import { defineConfig } from 'vitest/config';

// Standalone config for the Lighthouse helper unit tests. These helpers are
// plain Node ESM (no DOM), kept isolated from the root jsdom suite.
export default defineConfig({
  test: {
    include: ['lib/**/*.test.js'],
    environment: 'node',
  },
});
