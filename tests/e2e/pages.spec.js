const { test, expect } = require('@playwright/test');

async function collectDialogs(page, options = {}) {
  const messages = [];
  page.on('dialog', async (dialog) => {
    messages.push(dialog.message());

    if (options.dismissRefreshPrompt && dialog.message().includes('Refresh the page now')) {
      await dialog.dismiss();
      return;
    }

    await dialog.accept();
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

  test('teacher drawer toggles stay out of the way across representative viewports', async ({ page }) => {
    const viewports = [
      { width: 1600, height: 900, mode: 'wide' },
      { width: 1280, height: 800, mode: 'compact' },
      { width: 390, height: 844, mode: 'mobile' }
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/teacher.html');

      const toggleBox = await page.locator('.drawer-toggles').boundingBox();
      const pageBox = await page.locator('.page').boundingBox();
      const verseBarBox = await page.locator('.verse-bar').boundingBox();

      expect(toggleBox).not.toBeNull();
      expect(pageBox).not.toBeNull();
      expect(verseBarBox).not.toBeNull();

      if (viewport.mode === 'wide') {
        expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(pageBox.x - 8);
      } else {
        expect(toggleBox.y).toBeGreaterThanOrEqual(viewport.height - 220);
        expect(toggleBox.y + toggleBox.height).toBeLessThanOrEqual(verseBarBox.y - 8);
      }

      await page.locator('#toggle-media-btn').click();
      await expect(page.locator('#media-drawer')).toHaveClass(/open/);
      await page.locator('#media-close-btn').click();
      await expect(page.locator('#media-drawer')).not.toHaveClass(/open/);
    }
  });
});
