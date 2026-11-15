import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function cleanStubsPlugin(): Plugin {
  return {
    name: 'clean-css-entry-stubs',
    closeBundle() {
      rmSync(resolve(import.meta.dirname, 'assets/.vite-stubs'), {
        recursive: true,
        force: true
      });
    }
  };
}

export default defineConfig({
  publicDir: false,
  plugins: [cleanStubsPlugin()],
  build: {
    outDir: 'assets',
    emptyOutDir: false,
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        'css/admin': resolve(import.meta.dirname, 'src/scss/admin.scss'),
        'css/editor': resolve(import.meta.dirname, 'src/scss/editor.scss'),
        'css/student': resolve(import.meta.dirname, 'src/scss/student.scss'),
        'css/teacher': resolve(import.meta.dirname, 'src/scss/teacher.scss'),
        'js/editor': resolve(import.meta.dirname, 'src/editor/editor.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'js/editor') {
            return 'js/editor.js';
          }
          return '.vite-stubs/[name].js';
        },
        chunkFileNames: 'js/chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] ?? assetInfo.name ?? '';
          if (name.endsWith('.css')) {
            return '[name][extname]';
          }
          return 'bundles/[name]-[hash][extname]';
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
});
