const { test, expect } = require('@playwright/test');

function setupApiMocks(page) {
  let lessonPlansState = {
    lessonPlans: []
  };

  let classesState = {
    classes: []
  };

  return Promise.all([
    page.route('**/api/data/lessonplans', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(lessonPlansState)
      });
    }),
    page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(classesState)
      });
    }),
    page.route('**/api/save/lessonplans', async (route) => {
      const payload = route.request().postDataJSON() || {};
      lessonPlansState = {
        lessonPlans: Array.isArray(payload.lessonPlans) ? payload.lessonPlans : []
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          cloudSync: { ok: true }
        })
      });
    }),
    page.route('**/api/save/classes', async (route) => {
      const payload = route.request().postDataJSON() || {};
      classesState = {
        classes: Array.isArray(payload.classes) ? payload.classes : []
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          cloudSync: { ok: true }
        })
      });
    })
  ]);
}

test.describe('admin P0 workflow', () => {
  test('creates lesson plan + class and persists autosaved edits after reload', async ({ page }) => {
    const runId = Date.now();
    const lessonPlanTitle = `PW P0 Lesson ${runId}`;
    const classTitle = `PW P0 Class ${runId}`;
    const classSubtitle = `Subtitle ${runId}`;
    const classInstructor = `Instructor ${runId}`;
    const classChannel = `pw-p0-${runId}-control`;

    await setupApiMocks(page);

    await page.goto('/admin.html');
    await expect(page.locator('#lessonplans-list')).toBeVisible();

    await page.locator('#new-lessonplan-btn').click();
    await expect(page.locator('#lessonplan-modal')).toBeVisible();

    await page.locator('#lessonplan-title').fill(lessonPlanTitle);
    await page.locator('#lessonplan-description').fill('Playwright P0 workflow coverage');
    await page.getByRole('button', { name: /create lesson plan/i }).click();

    const createdPlanCard = page.locator('.lessonplan-card').filter({ hasText: lessonPlanTitle }).first();
    await expect(createdPlanCard).toBeVisible();
    await createdPlanCard.getByRole('button', { name: /open/i }).click();

    await expect(page.locator('#class-editor-view')).toBeVisible();
    await page.locator('#new-class-btn').click();

    await expect(page.locator('#classTitle')).toBeVisible();
    await page.locator('#classTitle').fill(classTitle);
    await page.locator('#classSubtitle').fill(classSubtitle);
    await page.locator('#classInstructor').fill(classInstructor);
    await page.locator('#classChannel').fill(classChannel);

    await page.waitForTimeout(3_600);

    await expect
      .poll(async () => {
        const text = await page.locator('#admin-save-toast').textContent();
        return text || '';
      }, { timeout: 12_000 })
      .toMatch(/saved/i);

    await page.reload();
    await expect(page.locator('#lessonplans-list')).toBeVisible();

    const reloadedPlanCard = page.locator('.lessonplan-card').filter({ hasText: lessonPlanTitle }).first();
    await expect(reloadedPlanCard).toBeVisible();
    await reloadedPlanCard.getByRole('button', { name: /open/i }).click();

    const firstClassTitle = page.locator('.class-item .class-item-title').first();
    await expect(firstClassTitle).toBeVisible();
    await firstClassTitle.click();

    await expect(page.locator('#classTitle')).toHaveValue(classTitle);
    await expect(page.locator('#classSubtitle')).toHaveValue(classSubtitle);
    await expect(page.locator('#classInstructor')).toHaveValue(classInstructor);
    await expect(page.locator('#classChannel')).toHaveValue(classChannel);
  });
});
