const { test, expect } = require('@playwright/test');

function classDocument(html) {
  return {
    id: 'class-1',
    classNumber: 1,
    title: 'Revision test class',
    outline: [],
    media: [],
    content: {
      html,
      json: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: html.replace(/<\/?p>/g, '') }] }]
      },
      text: html.replace(/<\/?p>/g, '')
    }
  };
}

async function mockEditorApi(page, initialHtml, latestHtml = initialHtml) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'editor-conflict-test', role: 'admin' } })
    });
  });

  await page.route('**/api/data/classes', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ classes: [classDocument(initialHtml)] })
    });
  });

  await page.route('**/api/editor/classes/1', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          document: classDocument(initialHtml),
          revision: 'revision-1'
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        document: classDocument(latestHtml),
        revision: 'revision-2'
      })
    });
  });
}

test.describe('editor conflict recovery P1', () => {
  test('compares a concurrent edit and saves local version only after confirmation', async ({ page }) => {
    let saveCount = 0;
    let savedPayload;

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'editor-conflict-test', role: 'admin' } })
      });
    });
    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ classes: [classDocument('<p>Shared text</p>')] })
      });
    });
    await page.route('**/api/editor/classes/1', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ document: classDocument('<p>Shared text</p>'), revision: 'revision-1' })
        });
        return;
      }

      saveCount += 1;
      savedPayload = route.request().postDataJSON();
      if (saveCount === 1) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'This document changed in another session.',
            latestDocument: classDocument('<p>Other browser edit</p>'),
            latestRevision: 'revision-2'
          })
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          document: classDocument(savedPayload.content.html),
          revision: 'revision-3'
        })
      });
    });

    await page.goto('/editor.html?class=1', { waitUntil: 'commit' });
    const prose = page.locator('#editor .ProseMirror');
    await expect(prose).toContainText('Shared text');
    await prose.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Local browser edit');
    await page.locator('#btn-save').click();

    await expect(page.locator('#editor-conflict-modal')).toBeVisible();
    await expect(page.locator('#editor-conflict-latest')).toContainText('Other browser edit');
    await expect(page.locator('#editor-conflict-local')).toContainText('Local browser edit');
    expect(saveCount).toBe(1);

    await page.locator('#btn-conflict-keep-local').click();
    await expect(page.locator('#save-status')).toHaveText(/saved/i);
    expect(saveCount).toBe(2);
    expect(savedPayload.expectedRevision).toBe('revision-2');
    expect(savedPayload.content.html).toContain('Local browser edit');
  });

  test('restores a locally saved draft after confirming it against the server version', async ({ page }) => {
    await mockEditorApi(page, '<p>Latest saved version</p>');
    await page.addInitScript(() => {
      localStorage.setItem('bst-editor-draft:classes:1', JSON.stringify({
        html: '<p>Recovered local draft</p>',
        revision: 'revision-1',
        updatedAt: new Date().toISOString()
      }));
    });

    await page.goto('/editor.html?class=1', { waitUntil: 'commit' });

    await expect(page.locator('#editor-conflict-modal')).toBeVisible();
    await expect(page.locator('#editor-conflict-local')).toContainText('Recovered local draft');
    await expect(page.locator('#editor-conflict-latest')).toContainText('Latest saved version');
    await page.locator('#btn-conflict-keep-local').click();
    await expect(page.locator('#save-status')).toHaveText(/saved/i);
    await expect(page.locator('#editor .ProseMirror')).toContainText('Recovered local draft');
  });

  test('saves a manually combined version after a local draft conflict', async ({ page }) => {
    await mockEditorApi(page, '<p>Latest saved version</p>');
    await page.addInitScript(() => {
      localStorage.setItem('bst-editor-draft:classes:1', JSON.stringify({
        html: '<p>Recovered local draft</p>',
        revision: 'revision-1',
        updatedAt: new Date().toISOString()
      }));
    });

    await page.goto('/editor.html?class=1', { waitUntil: 'commit' });
    await expect(page.locator('#editor-conflict-modal')).toBeVisible();
    await page.locator('#editor-conflict-merge').fill('<p>Combined version</p>');
    await page.locator('#btn-conflict-apply-merge').click();

    await expect(page.locator('#save-status')).toHaveText(/saved/i);
    await expect(page.locator('#editor .ProseMirror')).toContainText('Combined version');
  });

  test('preserves the current code-view content in a local draft', async ({ page }) => {
    await mockEditorApi(page, '<p>Latest saved version</p>');
    await page.goto('/editor.html?class=1', { waitUntil: 'commit' });
    await expect(page.locator('#editor .ProseMirror')).toContainText('Latest saved version');

    await page.locator('#btn-code-view').click();
    const codeMirror = page.locator('.CodeMirror');
    if (await codeMirror.count()) {
      await codeMirror.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('<p>Unsaved code-view changes</p>');
    } else {
      await page.locator('#editor-code-view').fill('<p>Unsaved code-view changes</p>');
    }
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));

    const draft = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('bst-editor-draft:classes:1'))
    );
    expect(draft.html).toContain('Unsaved code-view changes');
  });
});
