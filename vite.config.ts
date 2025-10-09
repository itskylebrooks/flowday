import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
});
