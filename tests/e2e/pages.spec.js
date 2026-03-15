const { test, expect } = require('@playwright/test');

async function collectDialogs(page, options = {}) {
  const messages = [];
  page.on('dialog', async (dialog) => {
    messages.push(dialog.message());

    try {
      if (options.dismissRefreshPrompt && dialog.message().includes('Refresh the page now')) {
        await dialog.dismiss();
        return;
      }

      await dialog.accept();
    } catch {}
  });

  return messages;
}

test.describe('core pages', () => {
  test('admin page loads lesson plan manager', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page).toHaveTitle(/Class Manager/i);
    await expect(page.locator('#header-title')).toHaveText(/Lesson Plans/i);
    await expect(page.locator('#lessonplans-list')).toBeVisible();
  });

  test('teacher page loads presenter controls', async ({ page }) => {
    await page.goto('/teacher.html');
    await expect(page).toHaveTitle(/Presenter View/i);
    await expect(page.locator('h1')).toHaveText(/Presenter View/i);
    await expect(page.locator('#open-display-btn')).toBeVisible();
  });

  test('editor page loads content editor shell', async ({ page }) => {
    await page.goto('/editor.html');
    await expect(page).toHaveTitle(/Bible Study Editor/i);
    await expect(page.locator('.editor-header h1')).toHaveText(/Bible Study Content Editor/i);
    await expect(page.locator('#save-status')).toContainText('Saved');
  });

  test('admin backup flow can create and restore a classes backup', async ({ page }) => {
    const dialogMessages = await collectDialogs(page, { dismissRefreshPrompt: true });

    await page.goto('/admin.html');
    await page.locator('#backup-btn').click();

    await expect(page.locator('#backup-modal')).toBeVisible();
    await expect(page.locator('#backup-list')).not.toContainText('Loading backups...');

    await page.getByRole('button', { name: /backup classes now/i }).click();
    await expect.poll(() => dialogMessages.some((message) => message.includes('Backup created:'))).toBe(true);

    const firstRestoreButton = page.locator('#backup-list .btn-restore').first();
    await expect(firstRestoreButton).toBeVisible();
    await firstRestoreButton.click();

    await expect.poll(() => dialogMessages.some((message) => message.includes('Restored classes.json from backup'))).toBe(true);
  });

});
