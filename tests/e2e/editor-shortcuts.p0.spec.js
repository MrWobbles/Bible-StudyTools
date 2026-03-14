const { test, expect } = require('@playwright/test');

test.describe('editor save and shortcuts P0', () => {
  test('shows modified status, saves on button and Ctrl+S, opens search with Ctrl+F', async ({ page }) => {
    const runId = Date.now();
    let classesState = {
      classes: [
        {
          id: 'class-1',
          classNumber: 1,
          title: `Editor Shortcut Class ${runId}`,
          subtitle: 'Editor shortcut coverage',
          instructor: 'Playwright',
          channelName: 'class1-control',
          media: [],
          outline: [],
          content: {
            html: '<p>Initial editor content.</p>',
            json: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Initial editor content.' }]
                }
              ]
            },
            text: 'Initial editor content.'
          }
        }
      ]
    };

    let saveCalls = 0;

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(classesState)
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      const payload = route.request().postDataJSON() || {};
      classesState = {
        classes: Array.isArray(payload.classes) ? payload.classes : []
      };
      saveCalls += 1;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, cloudSync: { ok: true } })
      });
    });

    await page.goto('/editor.html?class=1');
    await expect(page.locator('#save-status')).toHaveText(/saved/i);

    const prose = page.locator('#editor .ProseMirror');
    await expect(prose).toBeVisible();
    await prose.click();
    await page.keyboard.type(' Extra text for save flow.');

    await expect(page.locator('#save-status')).toHaveText(/modified/i);

    await page.locator('#btn-save').click();
    await expect(page.locator('#save-status')).toHaveText(/saved/i);
    expect(saveCalls).toBeGreaterThan(0);

    await prose.click();
    await page.keyboard.type(' More changes for Ctrl+S.');
    await expect(page.locator('#save-status')).toHaveText(/modified/i);

    await page.keyboard.press('Control+s');
    await expect(page.locator('#save-status')).toHaveText(/saved/i);
    expect(saveCalls).toBeGreaterThan(1);

    await page.keyboard.press('Control+f');
    await expect(page.locator('#search-modal')).toBeVisible();
  });
});
