const { test, expect } = require('@playwright/test');

test.describe('editor save flow P1', () => {
  test('saves class content with its loaded revision', async ({ page }) => {
    let savePayload = null;
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

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'editor-save-test', role: 'admin' } })
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
          body: JSON.stringify({ document: classesState.classes[0], revision: 'revision-1' })
        });
        return;
      }
      savePayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, document: classesState.classes[0], revision: 'revision-2' })
      });
    });

    await page.goto('/editor.html?class=1', { waitUntil: 'commit' });
    await page.locator('#editor .ProseMirror').click();
    await page.keyboard.type(' Saved from editor.');
    await page.locator('#btn-save').click();

    await expect(page.locator('#save-status')).toHaveText(/saved/i);
    expect(savePayload.expectedRevision).toBe('revision-1');
    expect(savePayload.content.html).toContain('Saved from editor.');
  });

  test('shows an error when revision-checked save fails', async ({ page }) => {
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

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'editor-save-test', role: 'admin' } })
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
          body: JSON.stringify({ document: classesState.classes[0], revision: 'revision-1' })
        });
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Supabase is disconnected. Cannot save editor content.' })
      });
    });

    await page.goto('/editor.html?class=1', { waitUntil: 'commit' });
    await page.locator('#editor .ProseMirror').waitFor();
    await page.locator('#editor .ProseMirror').click();
    await page.keyboard.type(' Unsaved after server failure.');
    await page.locator('#btn-save').click();

    await expect(page.locator('#save-status')).toHaveText(/failed/i);
  });
});
