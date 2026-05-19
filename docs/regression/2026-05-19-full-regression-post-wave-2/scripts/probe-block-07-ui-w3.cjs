const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, apiLogin, sleep } = H;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const ar = await apiLogin(ctx, QA_ADMIN);
  const csrf = ar.csrf;

  // Use the Wave3 prices store created in block-07
  const sR = await ctx.request.get(`${API}/api/stores`);
  const sJ = await sR.json();
  const arr = sJ.stores || sJ.items || (Array.isArray(sJ) ? sJ : []);
  const w3 = arr.find(s => s.code && s.code.startsWith('QA-W3-PR-'));
  if (!w3) { console.log('Wave3 prices store not found'); return; }
  console.log('using Wave3 prices store:', w3.id, w3.code);

  const page = await ctx.newPage();
  await page.goto(`${FE}/stores/${w3.id}/prices`, { waitUntil: 'domcontentloaded' });
  await sleep(3500);
  const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';
  const innerHTML = (await page.locator('body').innerHTML().catch(() => '')) || '';

  const usdIdx = body.indexOf('USD');
  const dolIdx = body.indexOf('$');
  const eurIdx = body.indexOf('EUR');
  const rubIdx = body.search(/руб|RUB|₽/i);
  console.log('USD:', usdIdx, eurIdx >= 0 ? body.slice(Math.max(0, usdIdx - 30), usdIdx + 60) : '');
  console.log('$:', dolIdx);
  console.log('EUR:', eurIdx);
  console.log('RUB/₽:', rubIdx, rubIdx >= 0 ? body.slice(Math.max(0, rubIdx - 30), rubIdx + 60) : '');

  // Check for currency select element with USD/EUR option
  const selects = await page.locator('select').all();
  console.log('# of selects:', selects.length);
  for (const s of selects) {
    const html = await s.innerHTML().catch(() => '');
    if (/USD|EUR/i.test(html)) console.log('!! USD/EUR found in select option:', html.slice(0, 300));
  }
  const options = await page.locator('option').allTextContents().catch(() => []);
  console.log('options text values:', options.slice(0, 30));

  await page.screenshot({ path: '/home/clawd/projects/scale-admin/docs/regression/2026-05-19-full-regression-post-wave-2/evidence/probe-prices-w3.png' });
  await browser.close();
})();
