const { test, expect } = require('@playwright/test');

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

});
