/** Find admin nav links and click each, capture URL+API calls. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD') })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };

const EVI = path.resolve(__dirname, '..', 'evidence', 'block-03');
const REPORT = path.resolve(EVI, 'admin-nav.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function login(page, who) {
  await page.goto(TARGET + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|stores|$)/, { timeout: 10000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await sleep(1500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  await login(page, ADMIN);

  await page.goto(TARGET + '/dashboard', { waitUntil: 'networkidle' });
  await sleep(1500);

  // Enumerate all anchors and buttons on the dashboard
  const navItems = await page.evaluate(() => {
    const out = [];
    const els = document.querySelectorAll('a, button, [role="menuitem"], [role="tab"]');
    els.forEach((el, i) => {
      const text = (el.innerText || el.textContent || '').trim();
      const href = el.getAttribute('href');
      const role = el.getAttribute('role');
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      if (text && visible && text.length < 80) {
        out.push({ idx: i, tag: el.tagName, text, href, role });
      }
    });
    return out;
  });

  fs.writeFileSync(path.resolve(EVI, 'admin-dashboard-nav.json'), JSON.stringify(navItems, null, 2));

  // Click links that look admin-related: Users, Access, Invites, Audit, Logs, Stores, Catalog
  const wanted = navItems.filter(n =>
    /^(users|users & access|access|invites|audit|logs|stores|products|catalog|fleet|dashboard|publish|scales|devices|operator|admin)$/i.test(n.text) ||
    /\/(users|stores|products|logs|audit|invites|scales|publications|fleet|admin)/i.test(n.href || '')
  );

  const results = {};
  for (const item of wanted) {
    const before = page.url();
    const apiCalls = [];
    const handler = r => { if (r.url().includes('/api/')) { try { apiCalls.push({ m: r.request().method(), u: r.url(), s: r.status() }); } catch {} } };
    page.on('response', handler);
    try {
      const locator = item.href ? page.locator(`a[href="${item.href}"]`).first() : page.getByText(item.text, { exact: false }).first();
      await locator.click({ timeout: 4000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await sleep(1800);
    } catch {}
    page.off('response', handler);
    const after = page.url();
    const h1 = await page.locator('h1').first().textContent({ timeout: 1500 }).catch(() => null);
    const h2 = await page.locator('h2').first().textContent({ timeout: 1500 }).catch(() => null);
    const main = await page.locator('main, [role="main"], #root').first().innerText({ timeout: 1500 }).catch(() => '');
    const tag = item.text.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40) || 'item';
    await page.screenshot({ path: path.resolve(EVI, `admin-nav-${tag}.png`), fullPage: true });
    results[item.text] = { before, after, h1, h2, mainSnippet: (main || '').slice(0, 500), apiCalls };
    // Return to dashboard for next click
    await page.goto(TARGET + '/dashboard', { waitUntil: 'networkidle' }).catch(() => {});
    await sleep(800);
  }

  fs.writeFileSync(REPORT, JSON.stringify(results, null, 2));
  console.log('Wrote', REPORT, 'with', Object.keys(results).length, 'items');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
