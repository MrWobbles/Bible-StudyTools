const { test, expect } = require('@playwright/test');

test.describe('admin token retry flow P1', () => {
  test('prompts on 401, retries with token, and reuses stored token for later protected calls', async ({ page }) => {
    const expectedToken = 'pw-secret-token';
    const promptMessages = [];
    const seenProtectedHeaders = [];

    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        promptMessages.push(dialog.message());
        await dialog.accept(expectedToken);
        return;
      }
      await dialog.accept();
    });

    await page.route('**/api/data/lessonplans', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lessonPlans: [] })
      });
    });

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ classes: [] })
      });
    });

    const protectedHandler = async (route) => {
      const headerToken = route.request().headers()['x-bst-admin-token'] || '';
      seenProtectedHeaders.push(headerToken);

      if (headerToken === expectedToken) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backups: [] })
        });
        return;
      }

      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' })
      });
    };

    await page.route('**/api/backups/classes', protectedHandler);
    await page.route('**/api/backups/lessonPlans', protectedHandler);

    await page.goto('/admin.html');
    await page.locator('#backup-btn').click();

    await expect(page.locator('#backup-modal')).toBeVisible();
    await expect.poll(() => promptMessages.length).toBe(1);

    const storedToken = await page.evaluate(() => localStorage.getItem('bst-admin-token'));
    expect(storedToken).toBe(expectedToken);

    const callsAfterFirstProtectedFetch = seenProtectedHeaders.length;
    await page.locator('#tab-lessonPlans').click();
    await expect.poll(() => seenProtectedHeaders.length).toBeGreaterThan(callsAfterFirstProtectedFetch);

    expect(promptMessages).toHaveLength(1);
    expect(seenProtectedHeaders.some((value) => value === expectedToken)).toBe(true);
  });
});
