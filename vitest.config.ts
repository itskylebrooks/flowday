import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@platforms': path.resolve(__dirname, 'src/platforms'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
    },
  },
});
