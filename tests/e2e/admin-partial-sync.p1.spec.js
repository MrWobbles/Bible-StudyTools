const { test, expect } = require('@playwright/test');

test.describe('admin partial-sync save flow P1', () => {
  test('uses partial upserts before aggregate saves for lesson plans and classes', async ({ page }) => {
    const runId = Date.now();
    let lessonPlansState = { lessonPlans: [] };
    let classesState = { classes: [] };

    const callOrder = [];
    const skipHeaders = {
      classes: '',
      lessonPlans: ''
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

    await page.route('**/api/mongo/lessonPlans/*', async (route) => {
      callOrder.push('mongo-lessonplans');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, mongodb: 'connected' })
      });
    });

    await page.route('**/api/mongo/classes/*', async (route) => {
      callOrder.push('mongo-classes');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, mongodb: 'connected' })
      });
    });

    await page.route('**/api/save/lessonPlans', async (route) => {
      callOrder.push('save-lessonplans');
      skipHeaders.lessonPlans = route.request().headers()['x-bst-skip-cloud-sync'] || '';

      const payload = route.request().postDataJSON() || {};
      lessonPlansState = {
        lessonPlans: Array.isArray(payload.lessonPlans) ? payload.lessonPlans : []
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, cloudSync: { ok: true, state: 'skipped' } })
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      callOrder.push('save-classes');
      skipHeaders.classes = route.request().headers()['x-bst-skip-cloud-sync'] || '';

      const payload = route.request().postDataJSON() || {};
      classesState = {
        classes: Array.isArray(payload.classes) ? payload.classes : []
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, cloudSync: { ok: true, state: 'skipped' } })
      });
    });

    await page.goto('/admin.html');
    await page.locator('#new-lessonplan-btn').click();
    await page.locator('#lessonplan-title').fill(`Partial Sync LP ${runId}`);
    await page.locator('#lessonplan-description').fill('Partial sync order check');
    await page.getByRole('button', { name: /create lesson plan/i }).click();

    const planCard = page.locator('.lessonplan-card').filter({ hasText: `Partial Sync LP ${runId}` }).first();
    await expect(planCard).toBeVisible();
    await planCard.getByRole('button', { name: /open/i }).click();

    await page.locator('#new-class-btn').click();

    await expect
      .poll(async () => {
        const text = await page.locator('#admin-save-toast').textContent();
        return text || '';
      }, { timeout: 10_000 })
      .toMatch(/saved/i);

    const firstLessonMongo = callOrder.indexOf('mongo-lessonplans');
    const firstLessonSave = callOrder.indexOf('save-lessonplans');
    const firstClassMongo = callOrder.indexOf('mongo-classes');

    expect(firstLessonMongo).toBeGreaterThanOrEqual(0);
    expect(firstLessonSave).toBeGreaterThanOrEqual(0);
    expect(firstClassMongo).toBeGreaterThanOrEqual(0);

    expect(firstLessonMongo).toBeLessThan(firstLessonSave);

    expect(skipHeaders.lessonPlans).toBe('1');
    if (skipHeaders.classes) {
      expect(skipHeaders.classes).toBe('1');
    }
  });

  test('falls back to aggregate save when class partial endpoint is unavailable', async ({ page }) => {
    let lessonPlansState = { lessonPlans: [] };
    let classesState = { classes: [] };
    let saveClassesCalled = false;

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

    await page.route('**/api/mongo/lessonPlans/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, mongodb: 'connected' })
      });
    });

    await page.route('**/api/mongo/classes/*', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Cannot PUT /api/mongo/classes/class-1' })
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
        body: JSON.stringify({ success: true, cloudSync: { ok: true, state: 'skipped' } })
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      saveClassesCalled = true;
      const payload = route.request().postDataJSON() || {};
      classesState = {
        classes: Array.isArray(payload.classes) ? payload.classes : []
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, cloudSync: { ok: true, state: 'skipped' } })
      });
    });

    await page.goto('/admin.html');
    await page.locator('#new-lessonplan-btn').click();
    await page.locator('#lessonplan-title').fill('Fallback LP');
    await page.getByRole('button', { name: /create lesson plan/i }).click();

    const planCard = page.locator('.lessonplan-card').filter({ hasText: 'Fallback LP' }).first();
    await planCard.getByRole('button', { name: /open/i }).click();
    await page.locator('#new-class-btn').click();

    await expect
      .poll(async () => {
        const text = await page.locator('#admin-save-toast').textContent();
        return text || '';
      }, { timeout: 10_000 })
      .toMatch(/saved/i);

    await expect.poll(() => saveClassesCalled, { timeout: 10_000 }).toBe(true);
  });
});
