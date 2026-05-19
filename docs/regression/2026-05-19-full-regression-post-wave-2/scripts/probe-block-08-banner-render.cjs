const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, apiLogin, sleep } = H;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  await apiLogin(ctx, QA_ADMIN);

  const sR = await ctx.request.get(`${API}/api/stores`);
  const sJ = await sR.json();
  const arr = sJ.stores || sJ.items || [];
  const w3 = arr.find(s => s.code && s.code.startsWith('QA-W3-BN-'));
  if (!w3) { console.log('not found'); return; }
  console.log('using store:', w3.id, w3.code);

  let dialogFired = false;
  let navigationToJs = false;
  const page = await ctx.newPage();
  page.on('dialog', d => { dialogFired = true; console.log('DIALOG:', d.message()); d.dismiss(); });
  page.on('framenavigated', f => { const u = f.url(); if (u.startsWith('javascript:') || u.startsWith('data:')) { navigationToJs = true; console.log('UNSAFE NAV:', u); } });

  await page.goto(`${FE}/#store:${w3.id}`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);

  // Click Advertising tab if visible
  try {
    const tab = page.locator('button:has-text("Advertising"), button:has-text("Реклам")').first();
    if (await tab.count()) {
      await tab.click();
      await sleep(2500);
    }
  } catch {}

  const innerHtml = (await page.locator('section.advertising-tab, [data-testid="advertising-tab"]').first().innerHTML().catch(() => '')) || '';
  console.log('advertising-tab innerHTML present?', !!innerHtml);
  if (innerHtml) {
    const m = innerHtml.match(/imageUrl|javascript:|not-a-url|src="[^"]*"/gi);
    console.log('innerHTML matches:', (m || []).slice(0, 20));
    console.log('advertising-tab snippet:', innerHtml.slice(0, 1800));
  } else {
    // fallback: full body
    const bodyHtml = (await page.locator('body').innerHTML().catch(() => '')) || '';
    const m = bodyHtml.match(/javascript:|not-a-url|<img[^>]*src=[^>]*>/gi);
    console.log('body matches:', (m || []).slice(0, 10));
  }

  // Now try to click a banner img/link if exists
  try {
    const allImgs = page.locator('img[src]');
    const imgCount = await allImgs.count();
    console.log('img count:', imgCount);
    for (let i = 0; i < Math.min(imgCount, 5); i++) {
      const src = await allImgs.nth(i).getAttribute('src');
      if (src && (src.startsWith('javascript:') || src.includes('not-a-url') || src.startsWith('data:'))) {
        console.log('found potentially unsafe img src:', src);
      }
    }
  } catch {}

  console.log('dialogFired:', dialogFired, 'navToJs:', navigationToJs);
  await page.screenshot({ path: '/home/clawd/projects/scale-admin/docs/regression/2026-05-19-full-regression-post-wave-2/evidence/probe-banner-render.png' });
  await browser.close();
})();
