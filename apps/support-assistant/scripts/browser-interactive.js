const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: { width: 1280, height: 900 } });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('localhost:3000')) || pages[0];
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
  // 点击 DKIM 示例问题按钮
  const btn = await page.$$eval('button', els => {
    const t = els.find(e => e.textContent.includes('DKIM'));
    if (t) { t.click(); return t.textContent.trim(); }
    return null;
  });
  // reasoning 模型（ark-code-latest）生成需 ~30-60s，首次 dev 编译更慢，放宽等待
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('h2')).some(h => h.textContent.includes('AI 建议') || h.textContent.includes('出错')),
    { timeout: 150000 }
  );
  await new Promise(r => setTimeout(r, 500));
  const result = await page.evaluate(() => {
    const h2s = Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim());
    const answerCard = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('AI 建议'));
    const answer = answerCard ? answerCard.parentElement.querySelector('p')?.textContent.trim() : null;
    const badge = document.querySelector('.bg-green-100, .bg-yellow-100, .bg-red-100')?.textContent.trim();
    const cites = Array.from(document.querySelectorAll('code')).map(c => c.textContent.trim());
    const sourcesH2 = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('检索来源'));
    const sourceCount = sourcesH2 ? sourcesH2.textContent.trim() : null;
    const errBox = document.querySelector('.bg-red-50')?.textContent.trim();
    return { h2s, answer: answer ? answer.slice(0, 400) : null, badge, cites, sourceCount, errBox };
  });
  console.log(JSON.stringify({ clicked: btn, ...result, jsErrors: errors }, null, 2));
  browser.disconnect();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });