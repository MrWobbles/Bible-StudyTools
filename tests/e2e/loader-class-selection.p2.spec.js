const { test, expect } = require('@playwright/test');

test.describe('loader class selection by query P2', () => {
  test('selects by id, by classNumber, and falls back safely for invalid query', async ({ page }) => {
    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          classes: [
            {
              id: 'guid-class-a',
              classNumber: 7,
              title: 'Fallback First Class',
              subtitle: 'First subtitle',
              instructor: 'Teacher A',
              channelName: 'class7-control',
              media: [],
              outline: []
            },
            {
              id: 'guid-class-b',
              classNumber: 8,
              title: 'Selected By ID Class',
              subtitle: 'Second subtitle',
              instructor: 'Teacher B',
              channelName: 'class8-control',
              media: [],
              outline: []
            }
          ]
        })
      });
    });

    await page.goto('/student.html?class=guid-class-b');
    await expect(page.locator('header h1')).toHaveText('Selected By ID Class');

    await page.goto('/student.html?class=7');
    await expect(page.locator('header h1')).toHaveText('Fallback First Class');

    await page.goto('/student.html?class=does-not-exist');
    await expect(page.locator('header h1')).toHaveText('Fallback First Class');
  });
});
