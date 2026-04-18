const { test, expect } = require('@playwright/test');

test.describe('editor save flow P1', () => {
  test('saves classes through aggregate endpoint without skip-cloud header', async ({ page }) => {
    let saveHeaderValue = null;
    let classesState = {
      classes: [
        {
          id: 'class-1',
          classNumber: 1,
          title: 'Editor Save Class',
          subtitle: '',
          instructor: '',
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

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(classesState)
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      saveHeaderValue = route.request().headers()['x-bst-skip-cloud-sync'] || '';
      const payload = route.request().postDataJSON() || {};
      classesState = {
        classes: Array.isArray(payload.classes) ? payload.classes : []
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await page.goto('/editor.html?class=1');
    await page.locator('#editor .ProseMirror').click();
    await page.keyboard.type(' Saved from editor.');
    await page.locator('#btn-save').click();

    await expect(page.locator('#save-status')).toHaveText(/saved/i);
    expect(saveHeaderValue).toBe('');
  });

  test('shows an error when aggregate save fails', async ({ page }) => {
    const classesState = {
      classes: [
        {
          id: 'class-1',
          classNumber: 1,
          title: 'Failing Save Class',
          subtitle: '',
          instructor: '',
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

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(classesState)
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Supabase is disconnected. Cannot save classes.' })
      });
    });

    await page.goto('/editor.html?class=1');
    await page.locator('#btn-save').click();

    await expect(page.locator('#save-status')).toHaveText(/error/i);
  });
});
