const { test, expect } = require('@playwright/test');

test.describe('admin token retry flow P1', () => {
  test('prompts on 401 and retries protected save with token', async ({ page }) => {
    const expectedToken = 'pw-secret-token';
    const promptMessages = [];
    const seenSaveHeaders = [];

    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        promptMessages.push(dialog.message());
        await dialog.accept(expectedToken);
        return;
      }
      await dialog.accept();
    });

    await page.route('**/api/data/lessonPlans', async (route) => {
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

    await page.route('**/api/data/notes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ notes: [] })
      });
    });

    await page.route('**/api/save/lessonPlans', async (route) => {
      const headerToken = route.request().headers()['x-bst-admin-token'] || '';
      seenSaveHeaders.push(headerToken);

      if (headerToken === expectedToken) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
        return;
      }

      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' })
      });
    });

    await page.goto('/admin.html');
    await page.locator('#new-lessonplan-btn').click();
    await page.locator('#lessonplan-title').fill('Token Retry Plan');
    await page.getByRole('button', { name: /create lesson plan/i }).click();

    await expect.poll(() => promptMessages.length).toBe(1);

    const storedToken = await page.evaluate(() => localStorage.getItem('bst-admin-token'));
    expect(storedToken).toBe(expectedToken);
    expect(seenSaveHeaders.some((value) => value === expectedToken)).toBe(true);

    await expect
      .poll(async () => {
        const text = await page.locator('#admin-save-toast').textContent();
        return text || '';
      }, { timeout: 10_000 })
      .toMatch(/saved/i);
  });
});
