const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('localhost:3000')) || pages[0];
  const found = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.textContent && n.textContent.includes('置信度')) {
        hits.push(n.textContent.trim().slice(0, 100));
      }
    }
    return hits;
  });
  console.log(JSON.stringify(found, null, 2));
  browser.disconnect();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });