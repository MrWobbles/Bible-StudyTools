const { test, expect } = require('@playwright/test');

test.describe('teacher stopping point markers P1', () => {
  const mockClassData = (stoppedAtSection = null, stoppedAtEditorLine = null) => ({
    classes: [
      {
        id: 'class-test-markers',
        classNumber: 1,
        title: 'Stop Marker Test Class',
        subtitle: 'Testing markers',
        instructor: 'Playwright',
        channelName: 'class1-control',
        stoppedAtSection,
        stoppedAtEditorLine,
        stoppedAtEditorHeading: null,
        stoppedMarkerUpdatedAt: null,
        stoppedMarkerAction: null,
        media: [
          {
            id: 'primary-video',
            type: 'video',
            title: 'Primary Video',
            primary: true,
            sources: [{ url: '' }],
            pausePoints: []
          }
        ],
        outline: [
          {
            id: 'section-prayer',
            summary: 'Opening prayer',
            defaultOpen: true,
            points: ['Point 1', 'Point 2']
          },
          {
            id: 'section-discussion',
            summary: 'Main discussion',
            defaultOpen: false,
            points: ['Discussion point 1']
          },
          {
            id: 'section-closing',
            summary: 'Closing thoughts',
            defaultOpen: false,
            points: ['Closing point']
          }
        ],
        content: {
          html: '<h2>Editor Content Line 1</h2><p>Some paragraph text</p><p>Another paragraph</p>'
        }
      }
    ]
  });

  test('clicking stop marker saves to server and updates UI', async ({ page }) => {
    let currentState = mockClassData();
    let saveCallCount = 0;
    let lastSavedPayload = null;

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentState)
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      saveCallCount++;
      lastSavedPayload = route.request().postDataJSON();

      // Update state with saved data
      if (lastSavedPayload?.classes?.[0]) {
        currentState = lastSavedPayload;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          cloudSync: { ok: true, state: 'skipped' }
        })
      });
    });

    await page.goto('/teacher.html?class=1');

    // Wait for outline to render
    const firstAccordion = page.locator('details.accordion[data-section-id="section-prayer"]');
    await expect(firstAccordion).toBeVisible();

    // Click the stop marker button on the first section
    const stopMarkerBtn = firstAccordion.locator('summary .stop-marker-btn');
    await expect(stopMarkerBtn).toBeVisible();
    await stopMarkerBtn.click();

    // Verify save was called
    await expect.poll(() => saveCallCount, { timeout: 5000 }).toBe(1);

    // Verify the saved payload contains the marker
    expect(lastSavedPayload?.classes?.[0]?.stoppedAtSection).toBe('section-prayer');
    expect(lastSavedPayload?.classes?.[0]?.stoppedMarkerAction).toBe('added');
    expect(lastSavedPayload?.classes?.[0]?.stoppedMarkerUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Verify UI shows the marker is active
    await expect(firstAccordion).toHaveClass(/stopped-here/);
    await expect(stopMarkerBtn).toHaveClass(/active/);
    await expect(stopMarkerBtn).toHaveAttribute('title', /Click to remove marker\nAdded /);
  });

  test('clicking active marker removes it', async ({ page }) => {
    // Start with an existing marker
    let currentState = mockClassData('section-prayer');
    let lastSavedPayload = null;

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentState)
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      lastSavedPayload = route.request().postDataJSON();
      currentState = lastSavedPayload;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, cloudSync: { ok: true } })
      });
    });

    await page.goto('/teacher.html?class=1');

    const firstAccordion = page.locator('details.accordion[data-section-id="section-prayer"]');
    await expect(firstAccordion).toHaveClass(/stopped-here/);

    // Click to remove the marker
    const stopMarkerBtn = firstAccordion.locator('summary .stop-marker-btn');
    await stopMarkerBtn.click();

    // Verify the marker was removed in the payload
    await expect.poll(() => lastSavedPayload?.classes?.[0]?.stoppedAtSection, { timeout: 5000 }).toBeNull();

    // Verify UI no longer shows marker as active
    await expect(firstAccordion).not.toHaveClass(/stopped-here/);
  });

  test('marker persists after page reload', async ({ page }) => {
    let currentState = mockClassData();

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentState)
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      const payload = route.request().postDataJSON();
      currentState = payload;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, cloudSync: { ok: true } })
      });
    });

    await page.goto('/teacher.html?class=1');

    // Set a marker
    const secondAccordion = page.locator('details.accordion[data-section-id="section-discussion"]');
    await expect(secondAccordion).toBeVisible();
    await secondAccordion.locator('summary .stop-marker-btn').click();

    // Wait for save to complete
    await expect.poll(() => currentState?.classes?.[0]?.stoppedAtSection, { timeout: 5000 }).toBe('section-discussion');

    // Reload the page
    await page.reload();

    // Verify the marker is still shown
    const reloadedAccordion = page.locator('details.accordion[data-section-id="section-discussion"]');
    await expect(reloadedAccordion).toHaveClass(/stopped-here/);
  });

  test('marker shows locally even when server save fails', async ({ page }) => {
    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockClassData())
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' })
      });
    });

    await page.goto('/teacher.html?class=1');

    const firstAccordion = page.locator('details.accordion[data-section-id="section-prayer"]');
    await firstAccordion.locator('summary .stop-marker-btn').click();

    // Wait a moment to ensure save was attempted
    await page.waitForTimeout(500);

    // UI should still show marker locally even though save failed
    await expect(firstAccordion).toHaveClass(/stopped-here/);
  });

  test('only one marker can be active at a time', async ({ page }) => {
    let currentState = mockClassData('section-prayer');
    currentState.classes[0].stoppedMarkerUpdatedAt = '2026-04-10T10:15:00.000Z';
    currentState.classes[0].stoppedMarkerAction = 'added';

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentState)
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      const payload = route.request().postDataJSON();
      currentState = payload;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, cloudSync: { ok: true } })
      });
    });

    await page.goto('/teacher.html?class=1');

    // First section should be marked
    const firstAccordion = page.locator('details.accordion[data-section-id="section-prayer"]');
    const secondAccordion = page.locator('details.accordion[data-section-id="section-discussion"]');

    await expect(firstAccordion).toHaveClass(/stopped-here/);
    await expect(secondAccordion).not.toHaveClass(/stopped-here/);

    // Mark a different section
    await secondAccordion.locator('summary .stop-marker-btn').click();

    // Wait for save
    await expect.poll(() => currentState?.classes?.[0]?.stoppedAtSection, { timeout: 5000 }).toBe('section-discussion');
    expect(currentState?.classes?.[0]?.stoppedMarkerAction).toBe('modified');
    expect(currentState?.classes?.[0]?.stoppedMarkerUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Now only second should be marked
    await expect(firstAccordion).not.toHaveClass(/stopped-here/);
    await expect(secondAccordion).toHaveClass(/stopped-here/);
    await expect(secondAccordion.locator('summary .stop-marker-btn')).toHaveAttribute('title', /Click to remove marker\nModified /);
  });

  test('editor line markers work in Editor Notes tab', async ({ page }) => {
    let currentState = mockClassData();
    let lastSavedPayload = null;

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentState)
      });
    });

    await page.route('**/api/save/classes', async (route) => {
      lastSavedPayload = route.request().postDataJSON();
      currentState = lastSavedPayload;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, cloudSync: { ok: true } })
      });
    });

    await page.goto('/teacher.html?class=1');

    // Switch to Editor Notes tab
    const editorTab = page.locator('.outline-tab[data-tab="editor"]');
    await editorTab.click();

    // Wait for editor content to render
    const editorContent = page.locator('.editor-content-display');
    await expect(editorContent).toBeVisible();

    // Find and click an editor line marker
    const firstLineMarker = page.locator('.editor-line-marker').first();
    await expect(firstLineMarker).toBeVisible();
    await firstLineMarker.click();

    // Verify save was called with editor line marker
    await expect.poll(() => lastSavedPayload?.classes?.[0]?.stoppedAtEditorLine, { timeout: 5000 }).toMatch(/^editor-line-/);
    expect(lastSavedPayload?.classes?.[0]?.stoppedMarkerAction).toBe('added');
    expect(lastSavedPayload?.classes?.[0]?.stoppedMarkerUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Verify outline section marker was cleared
    expect(lastSavedPayload?.classes?.[0]?.stoppedAtSection).toBeNull();

    // Verify UI shows the marker
    const lineRow = page.locator('.editor-line-row.stopped-here');
    await expect(lineRow).toBeVisible();
    await expect(firstLineMarker).toHaveAttribute('title', /Click to remove marker\nAdded /);
  });
});
