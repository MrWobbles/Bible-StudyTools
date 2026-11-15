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
        'css/vbs': resolve(import.meta.dirname, 'src/scss/vbs.scss'),
        'css/vbs-control': resolve(import.meta.dirname, 'src/scss/vbs-control.scss'),
        'js/editor': resolve(import.meta.dirname, 'src/editor/editor.ts'),
        'js/teacher': resolve(import.meta.dirname, 'src/features/teacher/teacher.ts'),
        'js/admin': resolve(import.meta.dirname, 'src/features/admin/admin.ts'),
        'js/teleprompter': resolve(import.meta.dirname, 'src/features/teleprompter/teleprompter.ts'),
        'js/student': resolve(import.meta.dirname, 'src/features/student/student.ts'),
        'js/vbs': resolve(import.meta.dirname, 'src/features/vbs/vbs.ts'),
        'js/vbs-control': resolve(import.meta.dirname, 'src/features/vbs/vbs-control.ts'),
        'js/user-admin': resolve(import.meta.dirname, 'src/features/user-admin/user-admin.ts'),
        'js/loader': resolve(import.meta.dirname, 'src/features/loader/loader.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name.startsWith('js/')) {
            return `${chunkInfo.name}.js`;
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
