const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: { width: 1400, height: 900 } });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('localhost:3000')) || pages[0];
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });

  await page.$$eval('button', els => { const t = els.find(e => e.textContent.includes('451')); if (t) t.click(); });

  // phase1: 本地检索结果秒出
  await page.waitForFunction(
    () => document.querySelectorAll('ul li').length > 0,
    { timeout: 15000 }
  );
  const phase1 = await page.evaluate(() => ({
    sourceCount: document.querySelectorAll('ul li').length,
    has分析中: document.body.textContent.includes('AI 分析中'),
  }));

  // phase2: 等置信度徽章元素（不是文本）出现
  await page.waitForSelector('.bg-green-100, .bg-yellow-100, .bg-red-100', { timeout: 150000 });
  const phase2 = await page.evaluate(() => {
    const badge = document.querySelector('.bg-green-100, .bg-yellow-100, .bg-red-100')?.textContent?.trim();
    const answerBubble = document.querySelector('.bg-gray-100 p')?.textContent?.slice(0, 250) || null;
    const cites = Array.from(document.querySelectorAll('.bg-gray-100 code')).map(c => c.textContent);
    return { badge, answerBubble, cites };
  });

  console.log(JSON.stringify({ phase1, phase2, jsErrors: errors }, null, 2));
  browser.disconnect();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });