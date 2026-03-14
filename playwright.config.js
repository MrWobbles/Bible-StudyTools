const { defineConfig } = require('@playwright/test');

const port = process.env.PORT || '3401';
const baseURL = `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm start',
    url: `${baseURL}/api/status`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      PORT: String(port),
      BST_DISABLE_BROWSER_OPEN: '1'
    }
  }
});
