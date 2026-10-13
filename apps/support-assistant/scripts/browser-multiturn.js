const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: { width: 1400, height: 950 } });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('localhost:3000')) || pages[0];
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });

  // 首次：点示例问题
  await page.$$eval('button', els => { const t = els.find(e => e.textContent.includes('451')); if (t) t.click(); });
  await page.waitForFunction(() => document.querySelectorAll('ul li').length > 0, { timeout: 15000 });
  const phase1 = { sourceCount: await page.$$eval('ul li', l => l.length) };

  // 等 AI 首次答案（incoming 气泡出现）
  await page.waitForFunction(
    () => document.querySelectorAll('.cs-message--incoming').length >= 1,
    { timeout: 150000 }
  );
  const firstAnswer = await page.evaluate(() => {
    const inc = Array.from(document.querySelectorAll('.cs-message--incoming .cs-message__content'));
    return { incomingCount: inc.length, lastText: inc[inc.length - 1]?.textContent?.slice(0, 120) };
  });

  // 追问：在 chatscope MessageInput 输入并发送
  const prevIncoming = firstAnswer.incomingCount;
  await page.type('.cs-message-input__content-editor', '那 DKIM 检查具体怎么做？');
  await page.keyboard.press('Enter');
  // 等 AI 回答：incoming 消息数增加
  await page.waitForFunction(
    (prev) => document.querySelectorAll('.cs-message--incoming').length > prev,
    { timeout: 150000 },
    prevIncoming
  );
  const followup = await page.evaluate(() => {
    const inc = Array.from(document.querySelectorAll('.cs-message--incoming .cs-message__content'));
    return { incomingCount: inc.length, lastText: inc[inc.length - 1]?.textContent?.slice(0, 200) };
  });

  console.log(JSON.stringify({ phase1, firstAnswer, followup, jsErrors: errors }, null, 2));
  browser.disconnect();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });