const { test, expect } = require('@playwright/test');

test.describe('admin backup restore guard rails P0', () => {
  test('restore flow handles refresh prompt dismiss and accept branches', async ({ page }) => {
    const dialogMessages = [];
    let refreshPromptCount = 0;

    page.on('dialog', async (dialog) => {
      const message = dialog.message();
      dialogMessages.push(message);

      if (dialog.type() === 'confirm' && message.includes('Are you sure you want to restore')) {
        await dialog.accept();
        return;
      }

      if (dialog.type() === 'confirm' && message.includes('Refresh the page now')) {
        refreshPromptCount += 1;
        if (refreshPromptCount === 1) {
          await dialog.dismiss();
        } else {
          await dialog.accept();
        }
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

    await page.route('**/api/backups/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          backups: [
            {
              fileName: 'classes_2026-03-14T15-04-18-162Z.json',
              timestamp: '2026-03-14T15:04:18.162Z'
            }
          ]
        })
      });
    });

    await page.route('**/api/backups/lessonPlans', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ backups: [] })
      });
    });

    await page.route('**/api/backups/restore', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Restored classes.json from backup' })
      });
    });

    await page.goto('/admin.html');
    await page.locator('#backup-btn').click();
    await expect(page.locator('#backup-modal')).toBeVisible();

    const restoreButton = page.locator('#backup-list .btn-restore').first();
    await expect(restoreButton).toBeVisible();

    await restoreButton.click();
    await expect.poll(() => refreshPromptCount).toBe(1);

    await restoreButton.click();
    await page.waitForLoadState('domcontentloaded');
    await expect.poll(() => refreshPromptCount).toBe(2);

    expect(dialogMessages.some((message) => message.includes('Restored classes.json from backup'))).toBe(true);
    await expect(page.locator('#lessonplans-list')).toBeVisible();
  });
});
