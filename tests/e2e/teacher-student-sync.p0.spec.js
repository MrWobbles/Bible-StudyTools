const { test, expect } = require('@playwright/test');

test.describe('teacher to student sync P0', () => {
  test('clear screen command from teacher reaches student display window', async ({ context }) => {
    const classesPayload = {
      classes: [
        {
          id: 'class-1',
          classNumber: 1,
          title: 'Playwright Sync Class',
          subtitle: 'Channel sync coverage',
          instructor: 'E2E',
          channelName: 'class1-control',
          media: [
            {
              id: 'primary-video',
              type: 'video',
              title: 'Primary Video',
              primary: true,
              sources: [
                {
                  url: ''
                }
              ],
              pausePoints: []
            }
          ],
          outline: []
        }
      ]
    };

    await context.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(classesPayload)
      });
    });

    const studentPage = await context.newPage();
    await studentPage.goto('/student.html?class=1');
    await expect(studentPage.locator('h1')).toHaveText(/Playwright Sync Class/i);

    await studentPage.evaluate(() => {
      window.__clearScreenCount = 0;
      const original = window.returnToDefaultView;
      window.returnToDefaultView = () => {
        window.__clearScreenCount += 1;
        if (typeof original === 'function') {
          original();
        }
      };
    });

    const teacherPage = await context.newPage();
    await teacherPage.goto('/teacher.html?class=1');
    await expect(teacherPage.locator('#open-display-btn')).toBeVisible();
    await expect(teacherPage.locator('#clear-screen')).toBeVisible();

    await teacherPage.locator('#clear-screen').click();

    await expect
      .poll(async () => studentPage.evaluate(() => window.__clearScreenCount || 0), {
        timeout: 8_000
      })
      .toBeGreaterThan(0);
  });
});
