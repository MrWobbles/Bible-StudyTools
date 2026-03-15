const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const classesPayload = {
  classes: [
    {
      id: 'class-1',
      classNumber: 1,
      title: 'Accessibility Test Class',
      subtitle: 'Automated accessibility checks',
      instructor: 'E2E',
      channelName: 'class1-control',
      media: [
        {
          id: 'primary-video',
          type: 'video',
          title: 'Primary Video',
          primary: true,
          sources: [{ type: 'local', url: 'assets/video/sample.mp4' }],
          pausePoints: []
        }
      ],
      outline: []
    }
  ]
};

function formatViolationSummary(violations) {
  return violations
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.help}`)
    .join('\n');
}

function getSeriousViolations(results) {
  return results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact));
}

async function attachApiMocks(page) {
  await page.route('**/api/data/classes', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(classesPayload)
    });
  });

  await page.route('**/api/data/lessonPlans', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lessonPlans: [] })
    });
  });
}

async function runAccessibilityCheck(page) {
  const results = await new AxeBuilder({ page })
    .disableRules(['color-contrast', 'aria-input-field-name'])
    .analyze();
  const seriousViolations = getSeriousViolations(results);

  expect(
    seriousViolations,
    `Serious/Critical accessibility violations found:\n${formatViolationSummary(seriousViolations)}`
  ).toEqual([]);
}

test.describe('accessibility checks P1', () => {
  test('admin page has no serious accessibility violations', async ({ page }) => {
    await attachApiMocks(page);
    await page.goto('/admin.html');
    await expect(page.locator('#lessonplans-list')).toBeVisible();
    await runAccessibilityCheck(page);
  });

  test('teacher page has no serious accessibility violations', async ({ page }) => {
    await attachApiMocks(page);
    await page.goto('/teacher.html?class=1');
    await expect(page.locator('#open-display-btn')).toBeVisible();
    await runAccessibilityCheck(page);
  });

  test('student page has no serious accessibility violations', async ({ page }) => {
    await attachApiMocks(page);
    await page.goto('/student.html?class=1');
    await expect(page.locator('h1')).toHaveText(/Accessibility Test Class/i);
    await runAccessibilityCheck(page);
  });

  test('editor page has no serious accessibility violations', async ({ page }) => {
    await page.goto('/editor.html');
    await expect(page.locator('#editor')).toBeVisible();
    await runAccessibilityCheck(page);
  });

  test('editor modals are hidden on initial load', async ({ page }) => {
    await page.goto('/editor.html');

    const modals = page.locator('.modal');
    await expect(modals).toHaveCount(7);
    await expect(page.locator('.modal.is-open')).toHaveCount(0);

    const modalCount = await modals.count();
    for (let index = 0; index < modalCount; index += 1) {
      await expect(modals.nth(index)).toBeHidden();
      await expect(modals.nth(index)).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
