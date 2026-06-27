const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err));

  await page.goto(`file://${__dirname}/test-tiptap.html`);
  
  await new Promise(r => setTimeout(r, 1000));
  await browser.close();
})();
