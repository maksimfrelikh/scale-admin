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
  console.log('using store:', w3?.id, w3?.code);

  const page = await ctx.newPage();
  // Hash-routed: #store:<uuid>
  await page.goto(`${FE}/#store:${w3.id}`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';

  // Find Prices tab and click it
  console.log('body has "Prices":', /Prices|Цен/i.test(body));
  console.log('body snippet (first 800 chars):', body.slice(0, 800));

  // Try to click on the "Prices" tab
  try {
    const tab = page.locator('button:has-text("Prices"), button:has-text("Цены")').first();
    if (await tab.count()) {
      await tab.click();
      await sleep(2500);
      console.log('clicked Prices tab');
    } else {
      console.log('no Prices tab button found, looking at /a or any role=tab');
      const tabs = page.locator('[role="tab"]');
      const tabCount = await tabs.count();
      console.log('tabs count:', tabCount);
      for (let i = 0; i < tabCount; i++) {
        const t = tabs.nth(i);
        const txt = await t.textContent();
        console.log(' tab', i, txt);
      }
    }
  } catch (e) {
    console.log('click failed:', e.message);
  }

  const body2 = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';
  // currency check
  const usdIdx = body2.indexOf('USD');
  const eurIdx = body2.indexOf('EUR');
  const rubMatch = body2.match(/(\d+\.?\d*)\s*(₽|руб|RUB)/i);
  const dolMatch = body2.match(/\$\s*\d/);
  console.log('AFTER tab — USD idx:', usdIdx);
  console.log('AFTER tab — EUR idx:', eurIdx);
  console.log('AFTER tab — RUB-shaped price:', rubMatch?.[0]);
  console.log('AFTER tab — $-shaped price:', dolMatch?.[0]);

  // Also dump the snippet where prices should be
  const idx = body2.search(/PriceP|77\.77|99\.5|88\.25/);
  if (idx >= 0) console.log('price area:', body2.slice(Math.max(0, idx - 50), idx + 200));

  // Search for "Prices" tab section
  const pIdx = body2.indexOf('Prices');
  console.log('Prices section idx:', pIdx);
  if (pIdx >= 0) console.log('Prices section:', body2.slice(pIdx, pIdx + 1000));

  // Try to find any currency formatter chars in the rendered prices area
  const priceTabHtml = await page.locator('section.prices-tab, [data-testid="prices-tab"]').first().innerHTML().catch(() => null);
  console.log('prices-tab section innerHTML present?', !!priceTabHtml);
  if (priceTabHtml) console.log('prices-tab snippet:', priceTabHtml.slice(0, 2000));

  await page.screenshot({ path: '/home/clawd/projects/scale-admin/docs/regression/2026-05-19-full-regression-post-wave-2/evidence/probe-prices-fixed.png' });
  await browser.close();
})();
