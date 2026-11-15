import { resolve } from 'node:path';
import { build } from 'vite';

const rootDir = resolve(import.meta.dirname, '..');

const entries = [
  { entry: 'src/shared/api/index.ts', fileName: 'api.js', globalName: 'BSTApiBundle' },
  { entry: 'src/shared/auth/auth.ts', fileName: 'auth.js', globalName: 'BSTAuthBundle' },
  { entry: 'src/shared/auth/auth-guard.ts', fileName: 'auth-guard.js', globalName: 'BSTAuthGuardBundle' },
  { entry: 'src/shared/auth/config.ts', fileName: 'config.js', globalName: 'BSTConfigBundle' },
  { entry: 'src/shared/theme/theme.ts', fileName: 'theme.js', globalName: 'BSTThemeBundle' },
  { entry: 'src/shared/theme/background.ts', fileName: 'background.js', globalName: 'BSTBackgroundBundle' },
  { entry: 'src/shared/theme/palette/index.ts', fileName: 'palette.js', globalName: 'BSTPaletteBundle', format: 'umd' },
  { entry: 'src/shared/ui/iconHelper.ts', fileName: 'iconHelper.js', globalName: 'BSTIconHelperBundle' },
  { entry: 'src/shared/ai/llmService.ts', fileName: 'llmService.js', globalName: 'BSTLlmServiceBundle' },
  { entry: 'src/shared/ai/outline/index.ts', fileName: 'outlineGenerator.js', globalName: 'BSTOutlineGeneratorBundle' }
];

for (const item of entries) {
  await build({
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    build: {
      outDir: resolve(rootDir, 'assets/js'),
      emptyOutDir: false,
      sourcemap: false,
      lib: {
        entry: resolve(rootDir, item.entry),
        name: item.globalName,
        formats: [item.format || 'iife'],
        fileName: () => item.fileName
      }
    }
  });
}
