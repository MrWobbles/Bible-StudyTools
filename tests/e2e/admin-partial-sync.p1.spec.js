const { test, expect } = require('@playwright/test');

test.describe('admin save flow P1', () => {
  test('saves lesson plans and classes through aggregate endpoints without skip headers', async ({ page }) => {
    const runId = Date.now();
    let lessonPlansState = { lessonPlans: [] };
    let classesState = { classes: [] };
    const skipHeaders = {
      lessonPlans: null,
      classes: null
    };

    await page.route('**/api/data/lessonPlans', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(lessonPlansState)
      });
    });

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(classesState)
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
      skipHeaders.lessonPlans = route.request().headers()['x-bst-skip-cloud-sync'] || '';
      const payload = route.request().postDataJSON() || {};
      lessonPlansState = {
        lessonPlans: Array.isArray(payload.lessonPlans) ? payload.lessonPlans : []
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      skipHeaders.classes = route.request().headers()['x-bst-skip-cloud-sync'] || '';
      const payload = route.request().postDataJSON() || {};
      classesState = {
        classes: Array.isArray(payload.classes) ? payload.classes : []
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await page.goto('/admin.html');
    await page.locator('#new-lessonplan-btn').click();
    await page.locator('#lessonplan-title').fill(`Supabase LP ${runId}`);
    await page.locator('#lessonplan-description').fill('Supabase-only save check');
    await page.getByRole('button', { name: /create lesson plan/i }).click();

    const planCard = page.locator('.lessonplan-card').filter({ hasText: `Supabase LP ${runId}` }).first();
    await expect(planCard).toBeVisible();
    await planCard.getByRole('button', { name: /open/i }).click();

    await page.locator('#new-class-btn').click();

    await expect
      .poll(async () => {
        const text = await page.locator('#admin-save-toast').textContent();
        return text || '';
      }, { timeout: 10_000 })
      .toMatch(/saved/i);

    expect(skipHeaders.lessonPlans).toBe('');
    expect(skipHeaders.classes).toBe('');
  });

  test('shows save failure toast when classes save fails', async ({ page }) => {
    let lessonPlansState = { lessonPlans: [] };

    await page.route('**/api/data/lessonPlans', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(lessonPlansState)
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
      const payload = route.request().postDataJSON() || {};
      lessonPlansState = {
        lessonPlans: Array.isArray(payload.lessonPlans) ? payload.lessonPlans : []
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Supabase is disconnected. Cannot save classes.' })
      });
    });

    await page.goto('/admin.html');
    await page.locator('#new-lessonplan-btn').click();
    await page.locator('#lessonplan-title').fill('Failing Save LP');
    await page.getByRole('button', { name: /create lesson plan/i }).click();

    const planCard = page.locator('.lessonplan-card').filter({ hasText: 'Failing Save LP' }).first();
    await planCard.getByRole('button', { name: /open/i }).click();

    await page.locator('#new-class-btn').click();

    await expect
      .poll(async () => {
        const text = await page.locator('#admin-save-toast').textContent();
        return text || '';
      }, { timeout: 10_000 })
      .toMatch(/failed/i);
  });
});
