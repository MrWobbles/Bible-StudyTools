const { test, expect } = require('@playwright/test');

test.describe('teacher notes persistence P1', () => {
  test('persists notes/questions across reload and supports export/import', async ({ page }) => {
    const initialNoteText = `Initial notes ${Date.now()}`;
    const initialQuestionText = 'Initial question response';
    const importedNoteText = 'Imported rich text note';
    const importedQuestionText = 'Imported question response';

    await page.route('**/api/data/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          classes: [
            {
              id: 'class-1',
              classNumber: 1,
              title: 'Teacher Notes Class',
              subtitle: 'Persistence coverage',
              instructor: 'Playwright',
              channelName: 'class1-control',
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
                  id: 'section-1',
                  summary: 'Opening discussion',
                  defaultOpen: true,
                  questions: [
                    {
                      key: 'section-1-q-1',
                      prompt: 'What stood out most?',
                      answer: 'Suggested answer'
                    }
                  ]
                }
              ]
            }
          ]
        })
      });
    });

    await page.goto('/teacher.html?class=1');

    const notes = page.locator('#notes');
    const question = page.locator('textarea[data-question-key="section-1-q-1"]');
    const firstAccordionSummary = page.locator('details.accordion summary').first();

    await expect(notes).toBeVisible();
    await firstAccordionSummary.click();
    await expect(question).toBeVisible();

    await notes.click();
    await page.keyboard.type(initialNoteText);
    await question.fill(initialQuestionText);

    await page.reload();
    await firstAccordionSummary.click();
    await expect(notes).toContainText(initialNoteText);
    await expect(question).toHaveValue(initialQuestionText);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download-notes').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/class1-notes\.json/i);

    const importPayload = {
      version: 1,
      classNumber: 1,
      notesHtml: `<p>${importedNoteText}</p>`,
      questions: {
        'section-1-q-1': importedQuestionText
      }
    };

    await page.setInputFiles('#notes-file', {
      name: 'imported-notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importPayload), 'utf8')
    });

    await expect(notes).toContainText(importedNoteText);
    await expect(question).toHaveValue(importedQuestionText);
  });
});
