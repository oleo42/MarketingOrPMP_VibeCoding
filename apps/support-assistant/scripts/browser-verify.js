const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: { width: 1280, height: 800 } });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('localhost:3000')) || pages[0];
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  const title = await page.title();
  const h1 = await page.$eval('h1', el => el.textContent).catch(() => '(no h1)');
  const hasTextarea = !!(await page.$('textarea'));
  const btnTexts = await page.$$eval('button', els => els.map(e => e.textContent.trim())).catch(() => []);
  const examples = btnTexts.filter(t => t.length > 5 && !['获取建议','重试'].includes(t));
  console.log(JSON.stringify({ title, h1, hasTextarea, examples: examples.slice(0,4), jsErrors: errors }, null, 2));
  browser.disconnect();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });