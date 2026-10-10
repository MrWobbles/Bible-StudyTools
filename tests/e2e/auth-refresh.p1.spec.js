const path = require('path');
const { test, expect } = require('@playwright/test');

async function loadApiClient(page) {
  await page.goto('/api/status');
  await page.evaluate(() => {
    localStorage.setItem('bst-supabase-access-token', 'expired-access');
    localStorage.setItem('bst-supabase-refresh-token', 'current-refresh');
  });
  await page.addScriptTag({ path: path.join(__dirname, '../../assets/js/api.js') });
}

test.describe('auth session refresh', () => {
  test('refreshes an expired token and retries the protected request', async ({ page }) => {
    let protectedRequestCount = 0;
    let refreshRequestCount = 0;

    await page.route('**/api/protected', async (route) => {
      protectedRequestCount += 1;
      if (protectedRequestCount === 1) {
        await route.fulfill({ status: 401, body: '{"error":"Authentication required."}' });
        return;
      }

      expect(route.request().headers().authorization).toBe('Bearer fresh-access');
      await route.fulfill({ status: 200, body: '{"success":true}' });
    });

    await page.route('**/api/auth/refresh', async (route) => {
      refreshRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: { accessToken: 'fresh-access', refreshToken: 'fresh-refresh' }
        })
      });
    });

    await loadApiClient(page);

    const response = await page.evaluate(async () => {
      const result = await window.BSTApi.fetch('/api/protected', {}, {
        requireAdmin: true,
        tryInteractiveLoginOnUnauthorized: false,
        promptForAdminTokenOnUnauthorized: false
      });
      return { status: result.status, body: await result.json() };
    });

    expect(response).toEqual({ status: 200, body: { success: true } });
    expect(protectedRequestCount).toBe(2);
    expect(refreshRequestCount).toBe(1);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bst-supabase-refresh-token')))
      .toBe('fresh-refresh');
  });

  test('shares concurrent refresh requests', async ({ page }) => {
    let refreshRequestCount = 0;

    await page.route('**/api/auth/refresh', async (route) => {
      refreshRequestCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: { accessToken: 'fresh-access', refreshToken: 'fresh-refresh' }
        })
      });
    });

    await loadApiClient(page);

    const results = await page.evaluate(() => Promise.all([
      window.BSTApi.refreshAuthSession(),
      window.BSTApi.refreshAuthSession()
    ]));

    expect(results).toEqual([true, true]);
    expect(refreshRequestCount).toBe(1);
  });
});
