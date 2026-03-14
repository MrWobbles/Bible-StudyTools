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

  test('teacher media drawer clicks render corresponding media in student window', async ({ context }) => {
    const classesPayload = {
      classes: [
        {
          id: 'class-1',
          classNumber: 1,
          title: 'Playwright Media Sync Class',
          subtitle: 'Cross-window media sync',
          instructor: 'E2E',
          channelName: 'class1-control',
          media: [
            {
              id: 'video-local',
              type: 'video',
              title: 'Drawer Video',
              primary: true,
              sources: [{ type: 'local', url: 'assets/video/sample.mp4' }],
              pausePoints: []
            },
            {
              id: 'image-item',
              type: 'image',
              title: 'Drawer Image',
              primary: false,
              sources: [{ type: 'image', url: 'https://example.com/drawer-image.jpg' }]
            },
            {
              id: 'pdf-item',
              type: 'pdf',
              title: 'Drawer PDF',
              primary: false,
              sources: [{ type: 'pdf', url: 'https://example.com/drawer.pdf' }]
            },
            {
              id: 'audio-item',
              type: 'audio',
              title: 'Drawer Audio',
              primary: false,
              sources: [{ type: 'audio', url: 'https://example.com/drawer.mp3' }]
            },
            {
              id: 'link-item',
              type: 'link',
              title: 'Drawer Link',
              primary: false,
              sources: [{ type: 'link', url: 'https://example.com/drawer-link' }]
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
    await expect(studentPage.locator('h1')).toHaveText(/Playwright Media Sync Class/i);

    const teacherPage = await context.newPage();
    await teacherPage.goto('/teacher.html?class=1');
    await expect(teacherPage.locator('#toggle-media-btn')).toBeVisible();

    await teacherPage.locator('#toggle-media-btn').click();
    await expect(teacherPage.locator('#media-drawer')).toHaveClass(/open/);

    await teacherPage.locator('.media-item', { hasText: 'Drawer Video' }).click();
    await expect(studentPage.locator('#local-video')).toBeVisible();

    await teacherPage.locator('.media-item', { hasText: 'Drawer Image' }).click();
    await expect(studentPage.locator('.player-shell img')).toBeVisible();
    await expect(studentPage.locator('.player-shell img')).toHaveAttribute('src', /drawer-image\.jpg/i);

    await teacherPage.locator('.media-item', { hasText: 'Drawer PDF' }).click();
    await expect(studentPage.locator('.player-shell iframe')).toBeVisible();
    await expect(studentPage.locator('.player-shell iframe')).toHaveAttribute('src', /drawer\.pdf/i);

    await teacherPage.locator('.media-item', { hasText: 'Drawer Audio' }).click();
    await expect(studentPage.locator('.player-shell audio')).toBeVisible();
    await expect(studentPage.locator('.player-shell audio')).toHaveAttribute('src', /drawer\.mp3/i);

    await teacherPage.locator('.media-item', { hasText: 'Drawer Link' }).click();
    await expect(studentPage.locator('.player-shell a', { hasText: /open link/i })).toBeVisible();
    await expect(studentPage.locator('.player-shell a', { hasText: /open link/i })).toHaveAttribute('href', /drawer-link/i);
  });
});
