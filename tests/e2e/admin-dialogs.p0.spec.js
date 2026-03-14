const { test, expect } = require('@playwright/test');

function setupApiMocks(page) {
  let lessonPlansState = {
    lessonPlans: []
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
        body: JSON.stringify({ classes: [] })
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
    })
  ]);
}

test.describe('admin dialogs P0', () => {
  test('validates empty lesson plan title and handles delete confirm cancel/accept', async ({ page }) => {
    const runId = Date.now();
    const lessonPlanTitle = `PW Dialog Plan ${runId}`;

    const alerts = [];
    const confirms = [];

    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'alert') {
        alerts.push(dialog.message());
        await dialog.accept();
        return;
      }

      if (dialog.type() === 'confirm') {
        confirms.push(dialog.message());
        const shouldAccept = confirms.length > 1;
        if (shouldAccept) {
          await dialog.accept();
        } else {
          await dialog.dismiss();
        }
      }
    });

    await setupApiMocks(page);
    await page.goto('/admin.html');

    await page.locator('#new-lessonplan-btn').click();
    await expect(page.locator('#lessonplan-modal')).toBeVisible();
    await page.getByRole('button', { name: /create lesson plan/i }).click();

    await expect.poll(() => alerts.length).toBeGreaterThan(0);
    expect(alerts[0]).toMatch(/please enter a lesson plan title/i);

    await page.locator('#lessonplan-title').fill(lessonPlanTitle);
    await page.locator('#lessonplan-description').fill('Dialog branch coverage');
    await page.getByRole('button', { name: /create lesson plan/i }).click();

    const planCard = page.locator('.lessonplan-card').filter({ hasText: lessonPlanTitle }).first();
    await expect(planCard).toBeVisible();

    await planCard.locator('button[title="Delete"]').click();
    await expect(planCard).toBeVisible();

    await planCard.locator('button[title="Delete"]').click();
    await expect(planCard).toHaveCount(0);

    expect(confirms.length).toBeGreaterThanOrEqual(2);
    expect(confirms[0]).toMatch(/delete this lesson plan/i);
  });
});
