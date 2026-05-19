const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, apiLogin, sleep } = H;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  await apiLogin(ctx, QA_ADMIN);

  const sR = await ctx.request.get(`${API}/api/stores`);
  const sJ = await sR.json();
  const arr = sJ.stores || sJ.items || [];
  const w3 = arr.find(s => s.code && s.code.startsWith('QA-W3-PR-'));
  if (!w3) { console.log('not found'); return; }

  const page = await ctx.newPage();
  await page.goto(`${FE}/stores/${w3.id}/prices`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';
  console.log('--- full body text (truncated 2000 chars) ---');
  console.log(body.slice(0, 2000));
  console.log('--- end ---');

  const html = (await page.locator('body').innerHTML().catch(() => '')) || '';
  const around = html.search(/USD|EUR|\$|RUB|₽|руб/i);
  console.log('first currency-ish match in innerHTML at:', around);
  if (around >= 0) console.log(html.slice(Math.max(0, around - 80), around + 200));

  await browser.close();
})();
