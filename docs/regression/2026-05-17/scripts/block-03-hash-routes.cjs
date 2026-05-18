/** Probe operator on /dashboard hash routes used by admin (global-logs, users-access, stores, products). */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD') })();
const OPERATOR = { email: 'qa-operator@***.invalid', password: QA_PASSWORD };
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-03');
const REPORT = path.resolve(EVI, 'H-operator-hash-routes.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  // Login operator
  await page.goto(TARGET + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(OPERATOR.email);
  await page.locator('input[type="password"]').first().fill(OPERATOR.password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|stores|$)/, { timeout: 10000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await sleep(1500);

  const results = {};
  const hashes = ['#global-logs', '#users-access', '#stores', '#products', '#invites', '#audit-log'];
  for (const h of hashes) {
    const apiCalls = [];
    const handler = r => { if (r.url().includes('/api/')) { try { apiCalls.push({ m: r.request().method(), u: r.url(), s: r.status() }); } catch {} } };
    page.on('response', handler);
    await page.goto(TARGET + '/dashboard' + h, { waitUntil: 'networkidle' }).catch(() => {});
    await sleep(1500);
    page.off('response', handler);
    const h1 = await page.locator('h1').first().textContent().catch(()=>null);
    const h2 = await page.locator('h2').first().textContent().catch(()=>null);
    const tag = h.replace('#','');
    const screenshot = path.resolve(EVI, `H-operator-hash-${tag}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const mainText = await page.locator('main, [role="main"], #root').first().innerText().catch(()=>'');
    results[h] = { url: page.url(), h1, h2, mainSnippet: (mainText || '').slice(0, 400), apiCalls: apiCalls.slice(0, 10) };
  }

  fs.writeFileSync(REPORT, JSON.stringify(results, null, 2));
  console.log('Wrote', REPORT);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
