/**
 * Block 4 — Store Detail tabs (proper), F (back/forward), G (hard refresh), H (404 + api endpoint), D.5 (operator malformed).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const PASSWORD = process.env.QA_PASSWORD;
if (!PASSWORD) throw new Error('Set QA_PASSWORD');
const ADMIN = { email: 'qa-admin@***.invalid', password: PASSWORD };
const OPERATOR = { email: 'qa-operator@***.invalid', password: PASSWORD };
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-04');
fs.mkdirSync(EVI, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

function instrument(page, label, store) {
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') store.console.push({ label, type: m.type(), text: m.text().slice(0, 400) });
  });
  page.on('pageerror', e => store.pageerrors.push({ label, message: e.message.slice(0, 400) }));
  page.on('response', r => { if (r.status() >= 400) store.network.push({ label, url: r.url(), status: r.status(), method: r.request().method() }); });
}

async function login(page, who) {
  await page.goto(TARGET + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|stores|$)/, { timeout: 15000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await sleep(2500);
}

async function snap(page, label) {
  const url = page.url();
  const h1 = (await page.locator('h1').first().textContent({ timeout: 1500 }).catch(() => '') || '').trim();
  const h2 = (await page.locator('h2').first().textContent({ timeout: 1500 }).catch(() => '') || '').trim();
  const bodyText = ((await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 250);
  await page.screenshot({ path: path.join(EVI, `${label}.png`), fullPage: false }).catch(() => {});
  return { label, url, h1, h2, bodyText };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = { startedAt: new Date().toISOString() };

  // --- C: Store Detail tabs (proper) ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const store = { console: [], pageerrors: [], network: [] };
    instrument(page, 'tabs', store);
    await login(page, ADMIN);

    await page.goto(TARGET + '/#stores', { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    // Discover ALL stores list rows and their entry points
    const storeRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[class*="store"]'));
      return rows.slice(0, 5).map(r => ({
        tag: r.tagName,
        cls: r.className.slice(0, 100),
        text: (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200)
      }));
    });
    report.storeRowsHint = storeRows;

    // Click Details on first row
    const detailsButtons = await page.locator('button:has-text("Details"), a:has-text("Details")').count();
    report.detailsButtonsCount = detailsButtons;

    if (detailsButtons > 0) {
      await page.locator('button:has-text("Details"), a:has-text("Details")').first().click({ timeout: 5000 });
      await sleep(2500);
    }
    report['C.0-after-details-click'] = await snap(page, 'C0-after-details');

    // Now we should be on store detail. Snapshot tabs.
    const tabsOnPage = await page.evaluate(() => {
      const out = [];
      const set = new Set();
      // tabs / buttons inside store detail
      Array.from(document.querySelectorAll('button, a, [role="tab"]')).forEach(el => {
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!txt || txt.length > 40 || set.has(txt)) return;
        set.add(txt);
        out.push({ tag: el.tagName, text: txt });
      });
      return out;
    });
    report.tabsDetected = tabsOnPage;

    // Try each canonical tab name
    const tabLabels = ['Overview', 'Catalog', 'Prices', 'Advertising', 'Banners', 'Scale Devices', 'Scales', 'Versions', 'Publishing', 'Logs'];
    for (const t of tabLabels) {
      let ok = false;
      try {
        const loc = page.locator(`button:has-text("${t}"):not(:has-text("Details")), [role="tab"]:has-text("${t}"), a:has-text("${t}")`).first();
        await loc.click({ timeout: 4000 });
        ok = true;
        await sleep(1500);
      } catch { ok = false; }
      if (!ok) { report[`C-skip-${t}`] = 'not found'; continue; }
      report[`C-${t}`] = await snap(page, `C-tab-${t.replace(/[^a-z0-9]+/gi, '_')}`);
    }

    report.tabsConsole = store.console.slice(0, 50);
    report.tabsPageErrors = store.pageerrors.slice(0, 50);
    report.tabsNetwork4xx5xx = store.network.slice(0, 50);

    await ctx.close();
  }

  // --- F: Back/Forward ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const store = { console: [], pageerrors: [], network: [] };
    instrument(page, 'backfwd', store);
    await login(page, ADMIN);

    const steps = [];
    // login → Dashboard (already there)
    steps.push({ step: 'F0-post-login', snap: await snap(page, 'F0-post-login') });

    // Stores
    await page.goto(TARGET + '/#stores', { waitUntil: 'domcontentloaded' }); await sleep(2000);
    steps.push({ step: 'F1-stores', snap: await snap(page, 'F1-stores') });

    // Store detail (via direct hash since Details click selection unreliable)
    await page.goto(TARGET + '/#stores/e73ba6bd-abb9-4596-9289-cca474fb2ec1', { waitUntil: 'domcontentloaded' }); await sleep(2000);
    steps.push({ step: 'F2-store-detail', snap: await snap(page, 'F2-store-detail') });

    // Click Catalog tab if available
    try {
      await page.locator('button:has-text("Catalog"), [role="tab"]:has-text("Catalog"), a:has-text("Catalog")').first().click({ timeout: 4000 });
      await sleep(1500);
    } catch {}
    steps.push({ step: 'F3-catalog', snap: await snap(page, 'F3-catalog') });

    try {
      await page.locator('button:has-text("Prices"), [role="tab"]:has-text("Prices"), a:has-text("Prices")').first().click({ timeout: 4000 });
      await sleep(1500);
    } catch {}
    steps.push({ step: 'F4-prices', snap: await snap(page, 'F4-prices') });

    // Back x3
    for (let i = 0; i < 3; i++) {
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(1500);
      steps.push({ step: `F-back-${i+1}`, snap: await snap(page, `F-back-${i+1}`) });
    }
    // Forward x2
    for (let i = 0; i < 2; i++) {
      await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(1500);
      steps.push({ step: `F-fwd-${i+1}`, snap: await snap(page, `F-fwd-${i+1}`) });
    }
    report.backFwdSteps = steps;

    // Logout then Back
    await page.locator('button:has-text("Logout"), a:has-text("Logout"), button:has-text("Выйти")').first().click({ timeout: 5000 }).catch(() => {});
    await sleep(2500);
    report['F-after-logout'] = await snap(page, 'F-after-logout');
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(2500);
    report['F-back-after-logout'] = await snap(page, 'F-back-after-logout');

    report.backFwdConsole = store.console.slice(0, 50);
    report.backFwdPageErrors = store.pageerrors.slice(0, 50);
    report.backFwdNetwork4xx5xx = store.network.slice(0, 50);

    await ctx.close();
  }

  // --- G: Hard refresh ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const store = { console: [], pageerrors: [], network: [] };
    instrument(page, 'refresh', store);
    await login(page, ADMIN);

    const pages = [
      '/#stores',
      '/#products',
      '/#users-access',
      '/#global-logs',
      '/#stores/e73ba6bd-abb9-4596-9289-cca474fb2ec1',
    ];
    const before = [], after = [];
    for (const p of pages) {
      await page.goto(TARGET + p, { waitUntil: 'domcontentloaded' }); await sleep(2000);
      before.push({ url: page.url(), snap: await snap(page, `G-before-${p.replace(/[^a-z0-9]+/gi, '_')}`) });
      await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(2500);
      after.push({ url: page.url(), snap: await snap(page, `G-after-${p.replace(/[^a-z0-9]+/gi, '_')}`) });
    }
    report.refreshBefore = before;
    report.refreshAfter = after;

    report.refreshConsole = store.console.slice(0, 50);
    report.refreshPageErrors = store.pageerrors.slice(0, 50);
    report.refreshNetwork4xx5xx = store.network.slice(0, 50);

    await ctx.close();
  }

  // --- H: 404 + direct API endpoint ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const store = { console: [], pageerrors: [], network: [] };
    instrument(page, '404', store);
    await login(page, ADMIN);

    const probes = ['/this-route-does-not-exist', '/admin/something', '/api-wrong/path', '/foo/bar/baz'];
    for (const p of probes) {
      await page.goto(TARGET + p, { waitUntil: 'domcontentloaded' }); await sleep(1500);
      const key = `H-path-${p.replace(/[^a-z0-9]+/gi, '_')}`;
      report[key] = await snap(page, key);
    }

    // /api/auth/session direct visit
    const resp = await page.goto(TARGET + '/api/auth/session', { waitUntil: 'domcontentloaded' }).catch(e => ({ error: e.message }));
    await sleep(1000);
    if (resp && resp.status) {
      const status = resp.status();
      const body = await page.evaluate(() => document.body ? document.body.textContent : null);
      const contentType = (resp.headers() || {})['content-type'] || '';
      report['H-api-session-direct'] = { status, contentType, body: (body || '').slice(0, 400), url: page.url() };
    } else {
      report['H-api-session-direct'] = { error: resp && resp.error };
    }

    await ctx.close();
  }

  // --- D.5: Operator malformed hash routes ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const store = { console: [], pageerrors: [], network: [] };
    instrument(page, 'op-mal', store);
    await login(page, OPERATOR);

    const malformed = ['/#garbage', '/#foo', '/#!', '/#/', '/#/stores/non-existent-uuid-12345', '/#stores/foo'];
    for (const m of malformed) {
      await page.goto(TARGET + m, { waitUntil: 'domcontentloaded' });
      await sleep(1500);
      const key = `D5-op-${m.replace(/[^a-z0-9]+/gi, '_')}`;
      report[key] = await snap(page, key);
    }

    report.opMalConsole = store.console.slice(0, 50);
    report.opMalNetwork = store.network.slice(0, 50);

    await ctx.close();
  }

  report.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(EVI, 'FGH-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify({ ok: !report.fatal, keys: Object.keys(report).length }));
})();
