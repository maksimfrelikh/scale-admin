const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, apiLogin, sleep } = H;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  await apiLogin(ctx, QA_ADMIN);

  // Visit an existing prices page with data
  const sR = await ctx.request.get(`${API}/api/stores`);
  const sJ = await sR.json();
  const arr = sJ.stores || sJ.items || (Array.isArray(sJ) ? sJ : []);
  const someStore = arr.find(s => s.status === 'active') || arr[0];
  console.log('using store:', someStore.id, someStore.code);

  const page = await ctx.newPage();
  await page.goto(`${FE}/stores/${someStore.id}/prices`, { waitUntil: 'domcontentloaded' });
  await sleep(3500);
  const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';

  // Find occurrences of USD / $ / EUR
  const usdIdx = body.indexOf('USD');
  const dolIdx = body.indexOf('$');
  const eurIdx = body.indexOf('EUR');
  const rubIdx = body.search(/руб|RUB|₽/i);
  console.log('USD idx:', usdIdx, usdIdx >= 0 ? ' context: ' + body.slice(Math.max(0, usdIdx - 50), usdIdx + 50) : '');
  console.log('$ idx:', dolIdx, dolIdx >= 0 ? ' context: ' + body.slice(Math.max(0, dolIdx - 50), dolIdx + 50) : '');
  console.log('EUR idx:', eurIdx, eurIdx >= 0 ? ' context: ' + body.slice(Math.max(0, eurIdx - 50), eurIdx + 50) : '');
  console.log('RUB/₽ idx:', rubIdx, rubIdx >= 0 ? ' context: ' + body.slice(Math.max(0, rubIdx - 50), rubIdx + 50) : '');

  // Also check innerHTML for currency tags
  const innerHtml = (await page.locator('body').innerHTML().catch(() => '')) || '';
  const m = innerHtml.match(/(USD|EUR|\$)[^<>]{0,40}/gi);
  console.log('innerHTML USD/EUR/$ matches:', (m || []).slice(0, 10));

  await page.screenshot({ path: '/home/clawd/projects/scale-admin/docs/regression/2026-05-19-full-regression-post-wave-2/evidence/probe-prices-ui.png' });
  await browser.close();
})();
