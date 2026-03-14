const { test, expect } = require('@playwright/test');

test.describe('editor partial-sync save flow P1', () => {
  test('calls partial Mongo upsert before local aggregate save', async ({ page }) => {
    const runId = Date.now();
    const callOrder = [];
    let skipHeaderValue = '';

    let classesState = {
      classes: [
        {
          id: 'class-1',
          classNumber: 1,
          title: `Partial Sync Class ${runId}`,
          subtitle: 'Partial sync coverage',
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

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(classesState)
      });
    });

    await page.route('**/api/mongo/classes/*', async (route) => {
      callOrder.push('mongo');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, mongodb: 'connected' })
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      callOrder.push('save');
      skipHeaderValue = route.request().headers()['x-bst-skip-cloud-sync'] || '';

      const payload = route.request().postDataJSON() || {};
      classesState = {
        classes: Array.isArray(payload.classes) ? payload.classes : []
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          cloudSync: {
            ok: true,
            state: 'skipped'
          }
        })
      });
    });

    await page.goto('/editor.html?class=1');
    const prose = page.locator('#editor .ProseMirror');
    await prose.click();
    await page.keyboard.type(' Test partial sync order.');
    await page.locator('#btn-save').click();

    await expect(page.locator('#save-status')).toHaveText(/saved/i);
    expect(callOrder.length).toBeGreaterThanOrEqual(2);
    expect(callOrder[0]).toBe('mongo');
    expect(callOrder[1]).toBe('save');
    expect(skipHeaderValue).toBe('1');
  });

  test('continues with local save when partial endpoint is unavailable', async ({ page }) => {
    let saveCalled = false;

    const classesState = {
      classes: [
        {
          id: 'class-1',
          classNumber: 1,
          title: 'Fallback Class',
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

    await page.route('**/api/mongo/classes/*', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Cannot PUT /api/mongo/classes/class-1' })
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      saveCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          cloudSync: {
            ok: true,
            state: 'skipped'
          }
        })
      });
    });

    await page.goto('/editor.html?class=1');
    const prose = page.locator('#editor .ProseMirror');
    await prose.click();
    await page.keyboard.type(' Save even with missing partial endpoint.');
    await page.locator('#btn-save').click();

    await expect(page.locator('#save-status')).toHaveText(/saved/i);
    expect(saveCalled).toBe(true);
  });
});
