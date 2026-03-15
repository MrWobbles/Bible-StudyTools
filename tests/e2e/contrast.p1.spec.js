const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const classesPayload = {
  classes: [
    {
      id: 'class-1',
      classNumber: 1,
      title: 'Contrast Test Class',
      subtitle: 'Theme contrast checks',
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

function formatViolations(violations) {
  return violations
    .map((violation) => `${violation.id} (${violation.impact || 'unknown'}): ${violation.help}`)
    .join('\n');
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

async function setTheme(page, theme) {
  await page.addInitScript((themeName) => {
    try {
      localStorage.setItem('bst-theme', themeName);
      document.documentElement.setAttribute('data-theme', themeName);
    } catch {
      // ignore storage failures
    }
  }, theme);
}

async function runContrastCheck(page, label) {
  const results = await new AxeBuilder({ page })
    .disableRules(['aria-input-field-name'])
    .withRules(['color-contrast'])
    .analyze();

  expect(
    results.violations,
    `Color contrast violations found for ${label}:\n${formatViolations(results.violations)}`
  ).toEqual([]);
}

async function runPageContrastTest(page, { theme, path, readySelector, label, needsApiMocks = true }) {
  if (needsApiMocks) {
    await attachApiMocks(page);
  }
  await setTheme(page, theme);
  await page.goto(path);
  await expect(page.locator(readySelector)).toBeVisible();
  await runContrastCheck(page, `${label} (${theme})`);
}

test.describe('color contrast checks P1', () => {
  const pages = [
    { path: '/admin.html', readySelector: '#lessonplans-list', label: 'admin' },
    { path: '/teacher.html?class=1', readySelector: '#open-display-btn', label: 'teacher' },
    { path: '/student.html?class=1', readySelector: 'h1', label: 'student' },
    { path: '/editor.html', readySelector: '#editor', label: 'editor', needsApiMocks: false }
  ];

  for (const theme of ['dark', 'light']) {
    for (const pageConfig of pages) {
      test(`${pageConfig.label} has no color contrast violations in ${theme} mode`, async ({ page }) => {
        await runPageContrastTest(page, { theme, ...pageConfig });
      });
    }
  }
});
