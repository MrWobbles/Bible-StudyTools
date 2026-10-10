const { test, expect } = require('@playwright/test');

test.describe('editor save and shortcuts P0', () => {
  test('shows modified status, saves, formats text, and opens editor modals with shortcuts', async ({ page }) => {
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
    let editorRevision = 'revision-1';

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'editor-shortcuts-test', role: 'admin' } })
      });
    });

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(classesState)
      });
    });

    await page.route('**/api/editor/classes/1', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ document: classesState.classes[0], revision: editorRevision })
        });
        return;
      }
      const payload = route.request().postDataJSON() || {};
      classesState.classes[0].content = payload.content;
      saveCalls += 1;
      editorRevision = `revision-${saveCalls + 1}`;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          document: classesState.classes[0],
          revision: editorRevision
        })
      });
    });

    await page.goto('/editor.html?class=1', { waitUntil: 'commit' });
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
    await page.keyboard.press('Escape');

    await prose.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+i');
    await expect(prose.locator('em')).toHaveText(/Initial editor content/);

    await page.keyboard.press('Control+Alt+i');
    await expect(page.locator('#image-modal')).toBeVisible();
  });
});
