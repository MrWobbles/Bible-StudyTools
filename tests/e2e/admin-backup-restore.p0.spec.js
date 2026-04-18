const { test, expect } = require('@playwright/test');

test.describe('admin save guard rails P0', () => {
  test('shows failure toast when lesson plan save fails and recovers on retry', async ({ page }) => {
    let firstSave = true;

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
      if (firstSave) {
        firstSave = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Supabase is disconnected. Cannot save lesson plans.' })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await page.goto('/admin.html');
    await page.locator('#new-lessonplan-btn').click();
    await page.locator('#lessonplan-title').fill('Guard Rail Plan');
    await page.getByRole('button', { name: /create lesson plan/i }).click();

    await expect
      .poll(async () => {
        const text = await page.locator('#admin-save-toast').textContent();
        return text || '';
      }, { timeout: 10_000 })
      .toMatch(/failed/i);

    await page.locator('#new-lessonplan-btn').click();
    await page.locator('#lessonplan-title').fill('Guard Rail Plan Retry');
    await page.getByRole('button', { name: /create lesson plan/i }).click();

    await expect
      .poll(async () => {
        const text = await page.locator('#admin-save-toast').textContent();
        return text || '';
      }, { timeout: 10_000 })
      .toMatch(/saved/i);
  });
});
