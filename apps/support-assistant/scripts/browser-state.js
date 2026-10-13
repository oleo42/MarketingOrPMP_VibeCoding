const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: { width: 1400, height: 900 } });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('localhost:3000')) || pages[0];
  // 不重新 goto，看当前页面状态（AI 可能还在生成）
  const state = await page.evaluate(() => {
    const text = document.body.textContent || '';
    return {
      has置信度: text.includes('置信度'),
      has分析中: text.includes('AI 分析中'),
      has已检索到: text.includes('已检索到'),
      badge: document.querySelector('.bg-green-100, .bg-yellow-100, .bg-red-100')?.textContent?.trim() || null,
      grayBubbles: document.querySelectorAll('.bg-gray-100').length,
      chatMessages: document.querySelectorAll('section')[1]?.querySelectorAll('.space-y-3 > div').length || 0,
    };
  });
  console.log(JSON.stringify(state, null, 2));
  browser.disconnect();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });