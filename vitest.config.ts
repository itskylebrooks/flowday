import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
      '@app': path.resolve(rootDir, 'src/app'),
      '@features': path.resolve(rootDir, 'src/features'),
      '@components': path.resolve(rootDir, 'src/components'),
      '@lib': path.resolve(rootDir, 'src/lib'),
      '@types': path.resolve(rootDir, 'src/types'),
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
