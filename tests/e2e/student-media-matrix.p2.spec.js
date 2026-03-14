const { test, expect } = require('@playwright/test');

test.describe('student media rendering matrix P2', () => {
  test('renders video/image/pdf/audio/link primary media types and verse command media', async ({ page }) => {
    const classesPayload = {
      classes: [
        {
          id: 'video-class',
          classNumber: 1,
          title: 'Video Class',
          subtitle: 'Media matrix',
          instructor: 'Playwright',
          channelName: 'class1-control',
          media: [
            {
              id: 'video-primary',
              type: 'video',
              title: 'Video Primary',
              primary: true,
              sources: [{ url: 'https://youtu.be/dQw4w9WgXcQ' }],
              pausePoints: []
            }
          ],
          outline: []
        },
        {
          id: 'image-class',
          classNumber: 2,
          title: 'Image Class',
          subtitle: 'Media matrix',
          instructor: 'Playwright',
          channelName: 'class2-control',
          media: [
            {
              id: 'image-primary',
              type: 'images',
              title: 'Image Primary',
              primary: true,
              sources: [{ url: 'https://example.com/test-image.jpg' }]
            }
          ],
          outline: []
        },
        {
          id: 'pdf-class',
          classNumber: 3,
          title: 'PDF Class',
          subtitle: 'Media matrix',
          instructor: 'Playwright',
          channelName: 'class3-control',
          media: [
            {
              id: 'pdf-primary',
              type: 'pdf',
              title: 'PDF Primary',
              primary: true,
              sources: [{ url: 'https://example.com/lesson.pdf' }]
            }
          ],
          outline: []
        },
        {
          id: 'audio-class',
          classNumber: 4,
          title: 'Audio Class',
          subtitle: 'Media matrix',
          instructor: 'Playwright',
          channelName: 'class4-control',
          media: [
            {
              id: 'audio-primary',
              type: 'audio',
              title: 'Audio Primary',
              primary: true,
              sources: [{ url: 'https://example.com/audio.mp3' }]
            }
          ],
          outline: []
        },
        {
          id: 'link-class',
          classNumber: 5,
          title: 'Link Class',
          subtitle: 'Media matrix',
          instructor: 'Playwright',
          channelName: 'class5-control',
          media: [
            {
              id: 'link-primary',
              type: 'link',
              title: 'Link Primary',
              primary: true,
              sources: [{ url: 'https://example.com/resource' }]
            }
          ],
          outline: []
        }
      ]
    };

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(classesPayload)
      });
    });

    await page.route('**://labs.bible.org/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { verse: 16, text: 'For God so loved the world...' },
          { verse: 17, text: 'For God did not send his Son...' }
        ])
      });
    });

    const expectations = [
      { classQuery: 'video-class', check: async () => expect(page.locator('.player-shell #player')).toBeVisible() },
      { classQuery: 'image-class', check: async () => expect(page.locator('.player-shell img')).toBeVisible() },
      { classQuery: 'pdf-class', check: async () => expect(page.locator('.player-shell iframe')).toBeVisible() },
      { classQuery: 'audio-class', check: async () => expect(page.locator('.player-shell audio')).toBeVisible() },
      { classQuery: 'link-class', check: async () => expect(page.locator('.player-shell a', { hasText: /open link/i })).toBeVisible() }
    ];

    for (const scenario of expectations) {
      await page.goto(`/student.html?class=${scenario.classQuery}`);
      await scenario.check();
    }

    await page.goto('/student.html?class=video-class');
    await page.evaluate(() => {
      window.handleRemoteCommand({
        type: 'displayMedia',
        sentAt: Date.now() + 1,
        media: {
          type: 'verse',
          reference: 'John 3:16-17',
          title: 'John 3:16-17',
          translation: 'kjv'
        }
      });
    });

    await expect(page.locator('.verse-frame')).toBeVisible();
    await expect(page.locator('.verse-title')).toContainText(/john 3:16-17/i);
  });

  test('renders command-driven media in student window for youtube id/url, verse, question, image, pdf, audio, and link', async ({ page }) => {
    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          classes: [
            {
              id: 'media-command-class',
              classNumber: 6,
              title: 'Media Command Class',
              subtitle: 'Command matrix',
              instructor: 'Playwright',
              channelName: 'class6-control',
              media: [
                {
                  id: 'video-primary',
                  type: 'video',
                  title: 'Video Primary',
                  primary: true,
                  sources: [{ url: 'https://youtu.be/dQw4w9WgXcQ' }],
                  pausePoints: []
                }
              ],
              outline: []
            }
          ]
        })
      });
    });

    await page.route('**://labs.bible.org/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { verse: 16, text: 'For God so loved the world...' },
          { verse: 17, text: 'For God did not send his Son...' }
        ])
      });
    });

    await page.goto('/student.html?class=media-command-class');

    await page.evaluate(() => {
      window.YT = {
        PlayerState: { PLAYING: 1 },
        Player: function MockPlayer(_id, options = {}) {
          this.getCurrentTime = () => 0;
          this.getPlayerState = () => 0;
          this.destroy = () => {};
          setTimeout(() => {
            if (options.events && typeof options.events.onReady === 'function') {
              options.events.onReady({ target: this });
            }
          }, 0);
        }
      };
    });

    await page.evaluate(() => {
      window.handleRemoteCommand({
        type: 'displayMedia',
        sentAt: Date.now() + 2,
        media: {
          type: 'video',
          title: 'Raw ID Video',
          sources: [{ type: 'youtube', url: 'dQw4w9WgXcQ' }]
        }
      });
    });
    await expect(page.locator('.player-shell #player')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.VIDEO_ID)).toBe('dQw4w9WgXcQ');

    await page.evaluate(() => {
      window.handleRemoteCommand({
        type: 'displayMedia',
        sentAt: Date.now() + 3,
        media: {
          type: 'video',
          title: 'URL Video',
          url: 'https://www.youtube.com/watch?v=9bZkp7q19f0'
        }
      });
    });
    await expect.poll(() => page.evaluate(() => window.VIDEO_ID)).toBe('9bZkp7q19f0');

    await page.evaluate(() => {
      window.handleRemoteCommand({
        type: 'displayMedia',
        sentAt: Date.now() + 4,
        media: {
          type: 'question',
          prompt: 'What stood out most?'
        }
      });
    });
    await expect(page.locator('.question-frame')).toBeVisible();
    await expect(page.locator('.question-prompt')).toContainText('What stood out most?');

    await page.evaluate(() => {
      window.handleRemoteCommand({
        type: 'displayMedia',
        sentAt: Date.now() + 5,
        media: {
          type: 'image',
          title: 'Image Media',
          url: 'https://example.com/lesson.jpg'
        }
      });
    });
    await expect(page.locator('.player-shell img')).toBeVisible();

    await page.evaluate(() => {
      window.handleRemoteCommand({
        type: 'displayMedia',
        sentAt: Date.now() + 6,
        media: {
          type: 'pdf',
          title: 'PDF Media',
          url: 'https://example.com/lesson.pdf'
        }
      });
    });
    await expect(page.locator('.player-shell iframe')).toBeVisible();

    await page.evaluate(() => {
      window.handleRemoteCommand({
        type: 'displayMedia',
        sentAt: Date.now() + 7,
        media: {
          type: 'audio',
          title: 'Audio Media',
          url: 'https://example.com/lesson.mp3'
        }
      });
    });
    await expect(page.locator('.player-shell audio')).toBeVisible();

    await page.evaluate(() => {
      window.handleRemoteCommand({
        type: 'displayMedia',
        sentAt: Date.now() + 8,
        media: {
          type: 'link',
          title: 'External Resource',
          url: 'https://example.com/resource'
        }
      });
    });
    await expect(page.locator('.player-shell a', { hasText: /open link/i })).toBeVisible();

    await page.evaluate(() => {
      window.handleRemoteCommand({
        type: 'displayMedia',
        media: {
          type: 'verse',
          reference: 'John 3:16-17',
          title: 'John 3:16-17',
          translation: 'kjv'
        }
      });
    });

    await expect(page.locator('.verse-frame')).toBeVisible();
    await expect(page.locator('.verse-title')).toContainText(/john 3:16-17/i);
  });
});
