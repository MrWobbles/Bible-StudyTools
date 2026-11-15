import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'assets/js',
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/shared/api/index.ts'),
      name: 'BSTApiBundle',
      formats: ['iife'],
      fileName: () => 'api.js',
    },
  },
});
