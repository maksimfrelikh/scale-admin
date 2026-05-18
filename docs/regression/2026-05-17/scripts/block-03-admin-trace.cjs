/** Capture all /api/* calls admin SPA makes when visiting Users, Logs, Audit, Dashboard. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD') })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };

const EVI = path.resolve(__dirname, '..', 'evidence', 'block-03');
const REPORT = path.resolve(EVI, 'admin-trace.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function login(page, who) {
  await page.goto(TARGET + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|stores|$)/, { timeout: 10000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await sleep(1200);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  await login(page, ADMIN);

  const adminAfter = page.url();

  const allCalls = [];
  page.on('response', async r => {
    if (r.url().includes('/api/')) {
      try { allCalls.push({ when: new Date().toISOString(), method: r.request().method(), url: r.url(), status: r.status() }); } catch {}
    }
  });

  const results = { adminLandingUrl: adminAfter, byRoute: {} };

  const routes = ['/dashboard', '/users', '/stores', '/products', '/logs', '/audit-log', '/audit', '/audit/logs', '/invites', '/users?role=operator'];
  for (const r of routes) {
    const before = allCalls.length;
    await page.goto(TARGET + r, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await sleep(2200);
    const calls = allCalls.slice(before);
    const h1 = await page.locator('h1').first().textContent({ timeout: 1500 }).catch(() => null);
    const h2 = await page.locator('h2').first().textContent({ timeout: 1500 }).catch(() => null);
    const sshot = path.resolve(EVI, `admin-trace${r.replace(/[\/?=&]/g, '_')}.png`);
    await page.screenshot({ path: sshot, fullPage: true });
    results.byRoute[r] = { finalUrl: page.url(), h1, h2, apiCalls: calls, screenshot: sshot };
  }

  fs.writeFileSync(REPORT, JSON.stringify(results, null, 2));
  console.log('Wrote', REPORT);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
