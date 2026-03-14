#!/usr/bin/env node

const { spawn } = require('child_process');

const filesToCheck = [
  'server.js',
  'db.js',
  'assets/js/admin.js',
  'assets/js/api.js',
  'assets/js/editor.js',
  'assets/js/loader.js',
  'assets/js/student.js',
  'assets/js/teacher.js',
  'assets/js/outlineGenerator.js',
  'assets/js/llmService.js',
  'assets/js/iconHelper.js',
  'desktop/main.js',
  'desktop/preload.js'
];

function runNodeCheck(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', filePath], {
      stdio: 'inherit',
      shell: false
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Syntax check failed: ${filePath}`));
      }
    });
  });
}

(async () => {
  try {
    for (const filePath of filesToCheck) {
      process.stdout.write(`[syntax] Checking ${filePath}\n`);
      await runNodeCheck(filePath);
    }
    process.stdout.write('[syntax] All syntax checks passed.\n');
  } catch (err) {
    process.stderr.write(`[syntax] ${err.message}\n`);
    process.exit(1);
  }
})();
