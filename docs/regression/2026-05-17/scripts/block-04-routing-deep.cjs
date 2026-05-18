/**
 * Block 4 — deep dive: URL convention, store row navigation, sections C/D/E.
 * Goal: understand post-login URL stays at /login + hash; capture all routes.
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
  await page.screenshot({ path: path.join(EVI, `${label}.png`), fullPage: false }).catch(() => {});
  return { label, url, h1, h2 };
}

async function clickByText(page, text) {
  try {
    await page.locator(`button:has-text("${text}"), a:has-text("${text}"), [role="tab"]:has-text("${text}")`).first().click({ timeout: 3500 });
    await sleep(1500);
    return true;
  } catch { return false; }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const store = { console: [], pageerrors: [], network: [] };
  instrument(page, 'deep', store);
  const report = { startedAt: new Date().toISOString() };

  try {
    await login(page, ADMIN);
    report.postLogin = await snap(page, 'D-postlogin');

    // URL convention check — what happens if we visit / directly?
    await page.goto(TARGET + '/', { waitUntil: 'domcontentloaded' }); await sleep(2000);
    report.rootDirect = await snap(page, 'D-root-direct');
    await page.goto(TARGET + '/dashboard', { waitUntil: 'domcontentloaded' }); await sleep(2000);
    report.dashboardDirect = await snap(page, 'D-dashboard-direct');

    // ===== SECTION C: Store Detail tabs =====
    // Go to Stores via hash
    await page.goto(TARGET + '/#stores', { waitUntil: 'domcontentloaded' }); await sleep(2000);
    report['C.list'] = await snap(page, 'C-stores-list');

    // Find first store row — try multiple strategies
    const storeRow = await page.evaluate(() => {
      // Look for any tr/li/div that includes a UUID-like text or is the first row in a list
      const allClickables = Array.from(document.querySelectorAll('tr, li, [role="row"], [class*="row" i], [class*="card" i]'));
      // Filter to clickable-looking
      const out = [];
      for (const el of allClickables) {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 5 || text.length > 400) continue;
        const hasUuid = /[0-9a-f]{8}-[0-9a-f]{4}/i.test(text);
        const onclick = el.onclick !== null;
        const cursor = window.getComputedStyle(el).cursor;
        out.push({ tag: el.tagName, text: text.slice(0, 120), hasUuid, onclick, cursor, classList: el.className.slice(0, 200) });
        if (out.length >= 15) break;
      }
      return out;
    });
    report.storeRowProbe = storeRow;

    // Look for store cards/links via DOM dump
    const storeLinks = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a'));
      return allLinks.filter(a => /store|view|open|details/i.test(a.textContent || '') || /store/i.test(a.getAttribute('href') || '')).slice(0, 20).map(a => ({ text: (a.textContent || '').trim().slice(0, 80), href: a.getAttribute('href') }));
    });
    report.storeLinks = storeLinks;

    // Look for buttons inside store rows
    const storeButtons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.filter(b => /open|view|select|details|manage|catalog/i.test(b.textContent || '')).slice(0, 30).map(b => ({ text: (b.textContent || '').trim().slice(0, 80) }));
    });
    report.storeButtons = storeButtons;

    // Try clicking the first button labelled "Open" or similar
    let clickedStore = false;
    for (const label of ['Open', 'View', 'Details', 'Manage', 'Подробнее', 'Открыть', 'Перейти']) {
      try {
        const cnt = await page.locator(`button:has-text("${label}"), a:has-text("${label}")`).count();
        if (cnt > 0) {
          await page.locator(`button:has-text("${label}"), a:has-text("${label}")`).first().click({ timeout: 3000 });
          await sleep(2500);
          clickedStore = true;
          report.storeClickedBy = label;
          break;
        }
      } catch (e) { /* try next */ }
    }
    if (!clickedStore) {
      // try clicking the row itself (the first store row)
      try {
        const cnt = await page.locator('tr:has-text("QA"), tr:has-text("STORE"), li:has-text("QA"), li:has-text("STORE"), [class*="row"]:has-text("QA")').count();
        if (cnt > 0) {
          await page.locator('tr:has-text("QA"), tr:has-text("STORE"), li:has-text("QA"), li:has-text("STORE"), [class*="row"]:has-text("QA")').first().click({ timeout: 3000 });
          await sleep(2500);
          clickedStore = true;
          report.storeClickedBy = 'row-text-match';
        }
      } catch (e) { /* fall through */ }
    }
    if (!clickedStore) {
      // Last resort: navigate by URL with a known operator's assigned store (admin sees it too)
      await page.goto(TARGET + '/#stores/e73ba6bd-abb9-4596-9289-cca474fb2ec1', { waitUntil: 'domcontentloaded' });
      await sleep(2500);
      clickedStore = 'fallback-direct-hash';
      report.storeClickedBy = 'direct-url-fallback';
    }
    report['C.0-store-landing'] = await snap(page, 'C0-store-landing-deep');

    // Walk through tabs by text
    const tabLabels = ['Overview', 'Catalog', 'Prices', 'Advertising', 'Scale Devices', 'Scales', 'Versions', 'Publishing', 'Logs', 'Обзор', 'Каталог', 'Цены', 'Реклама', 'Весы', 'Версии', 'Публикация', 'Логи'];
    for (const t of tabLabels) {
      const ok = await clickByText(page, t);
      if (!ok) { report[`C-skip-${t}`] = 'not found'; continue; }
      report[`C-${t}`] = await snap(page, `C-tab-${t.replace(/[^a-z0-9]+/gi, '_')}`);
    }

    // ===== SECTION D: Malformed hash routes (admin) =====
    const malformed = [
      '/#garbage', '/#foo', '/#!', '/#/',
      '/#/stores/non-existent-uuid-12345',
      '/#/stores/e73ba6bd-abb9-4596-9289-cca474fb2ec1/nonexistent-tab',
      '/#stores/foo', '/#/stores//empty',
      '/#stores/00000000-0000-0000-0000-000000000000',
      '/#users/bogus', '/#audit-log', '/#audit',
    ];
    for (const m of malformed) {
      await page.goto(TARGET + m, { waitUntil: 'domcontentloaded' });
      await sleep(1500);
      const key = `D-${m.replace(/[^a-z0-9]+/gi, '_')}`;
      report[key] = await snap(page, key);
    }

    // ===== SECTION E: Path vs hash (admin) =====
    const pathProbes = [
      '/users', '/audit-log', '/logs', '/global-logs', '/stores/new',
      '/stores/e73ba6bd-abb9-4596-9289-cca474fb2ec1/edit',
      '/dashboard', '/', '/login'
    ];
    for (const p of pathProbes) {
      await page.goto(TARGET + p, { waitUntil: 'domcontentloaded' });
      await sleep(1500);
      const key = `E-path-${p.replace(/[^a-z0-9]+/gi, '_')}`;
      report[key] = await snap(page, key);
    }

    // Compare hash vs path for known endpoints
    const hashProbes = ['/#users', '/#users-access', '/#audit-log', '/#logs', '/#global-logs'];
    for (const h of hashProbes) {
      await page.goto(TARGET + h, { waitUntil: 'domcontentloaded' });
      await sleep(1500);
      const key = `E-hash-${h.replace(/[^a-z0-9]+/gi, '_')}`;
      report[key] = await snap(page, key);
    }

    report.console = store.console.slice(0, 100);
    report.pageerrors = store.pageerrors.slice(0, 100);
    report.network4xx5xx = store.network.slice(0, 100);
  } catch (e) {
    report.fatal = { message: e.message, stack: (e.stack || '').slice(0, 1500) };
  }
  report.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(EVI, 'deep-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify({ ok: !report.fatal, keys: Object.keys(report).length, evidence: EVI }));
})();
