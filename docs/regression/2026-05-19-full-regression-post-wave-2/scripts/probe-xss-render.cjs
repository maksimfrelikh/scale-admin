/**
 * Probe XSS-named product rendering in UI products list.
 * If <script> in product name is rendered as HTML by React, alert dialog appears.
 */
const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, sleep, apiLogin, uiLogin, ev, shot } = H;
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();

  // Create XSS-named active product
  const ar = await apiLogin(ctx, QA_ADMIN);
  const csrf = ar.csrf;
  const xssName = '<img src=x onerror=window.__xssFired=true>Wave3XSS-' + Date.now();
  const pluCode = String(7200000000000n + BigInt(Math.floor(Math.random() * 1e9))).slice(0, 13);
  const cr = await ctx.request.post(`${API}/api/products`, {
    data: { defaultPluCode: pluCode, name: xssName, shortName: 'X', unit: 'g', status: 'active' },
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });
  const cj = await cr.json().catch(() => ({}));
  console.log('create status:', cr.status(), 'id:', cj.id);

  let dialogTriggered = false;
  const page = await ctx.newPage();
  page.on('dialog', async d => { dialogTriggered = true; console.log('UNEXPECTED DIALOG:', d.message()); await d.dismiss(); });

  // ctx already authenticated via apiLogin — go straight to products
  await page.goto(`${FE}/products`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);

  // Search for our product
  try {
    const searchBox = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="Поиск"]').first();
    if (await searchBox.count()) {
      await searchBox.fill('Wave3XSS');
      await sleep(2500);
    }
  } catch {}

  await shot(page, ev('block-04-xss-probe-list.png'));
  const xssFired = await page.evaluate(() => !!window.__xssFired);
  const bodyHtml = (await page.locator('body').innerHTML().catch(() => '')) || '';
  const xssEscapedInHtml = bodyHtml.includes('&lt;img');
  const xssRawInHtml = /<img\s+src=x\s+onerror=/i.test(bodyHtml);
  const xssFiredVar = await page.evaluate(() => !!(window).__xssFired);

  console.log('dialogTriggered:', dialogTriggered);
  console.log('window.__xssFired:', xssFiredVar);
  console.log('xss raw <img> tag in DOM:', xssRawInHtml);
  console.log('xss escaped (&lt;img):', xssEscapedInHtml);

  // Cleanup
  if (cj.id) {
    await ctx.request.patch(`${API}/api/products/${cj.id}`, { data: { status: 'archived' }, headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' } });
  }

  await browser.close();
})();
