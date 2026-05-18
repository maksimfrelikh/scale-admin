/**
 * Block 4 sections A, B, C — Admin nav walk, Operator nav walk, Store Details tabs.
 * Captures URL, headings, console errors, network failures per click.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const PASSWORD = process.env.QA_PASSWORD;
if (!PASSWORD) throw new Error('Set QA_PASSWORD env var');

const ADMIN = { email: 'qa-admin@***.invalid', password: PASSWORD };
const OPERATOR = { email: 'qa-operator@***.invalid', password: PASSWORD };

const EVI = path.resolve(__dirname, '..', 'evidence', 'block-04');
fs.mkdirSync(EVI, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

function attachInstrumentation(page, label, store) {
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      store.console.push({ label, type: msg.type(), text: msg.text().slice(0, 500) });
    }
  });
  page.on('pageerror', err => {
    store.pageerrors.push({ label, message: err.message.slice(0, 500) });
  });
  page.on('response', resp => {
    const status = resp.status();
    if (status >= 400) {
      store.network.push({ label, url: resp.url(), status, method: resp.request().method() });
    }
  });
}

async function login(page, who) {
  await page.goto(TARGET + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|stores|$)/, { timeout: 15000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await sleep(2000);
}

async function snapshot(page, label) {
  const url = page.url();
  const title = await page.title().catch(() => '');
  const h1 = await page.locator('h1').first().textContent({ timeout: 1500 }).catch(() => '');
  const h2 = await page.locator('h2').first().textContent({ timeout: 1500 }).catch(() => '');
  const bodyText = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')).slice(0, 400);
  await page.screenshot({ path: path.join(EVI, `${label}.png`), fullPage: false }).catch(() => {});
  return { label, url, title, h1: (h1 || '').trim(), h2: (h2 || '').trim(), bodyText: bodyText.replace(/\s+/g, ' ').trim() };
}

async function getNavLinks(page) {
  // Try common nav structures
  return await page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll('nav a, [role="navigation"] a, aside a, [class*="sidebar"] a, [class*="Sidebar"] a, header a'));
    const seen = new Set();
    const out = [];
    for (const a of cands) {
      const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
      const href = a.getAttribute('href') || '';
      if (!text || !href || href === '#') continue;
      const key = `${text}|${href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text, href });
    }
    return out;
  });
}

async function clickNavItem(page, text) {
  const link = page.locator(`nav a:has-text("${text}"), aside a:has-text("${text}"), [class*="sidebar"] a:has-text("${text}"), header a:has-text("${text}")`).first();
  try {
    await link.click({ timeout: 4000 });
    await sleep(1500);
    return true;
  } catch (e) {
    // Try button form
    try {
      await page.locator(`button:has-text("${text}"), [role="button"]:has-text("${text}")`).first().click({ timeout: 3000 });
      await sleep(1500);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

async function runAdminNav(browser, report) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const store = { console: [], pageerrors: [], network: [] };
  attachInstrumentation(page, 'admin-nav', store);

  await login(page, ADMIN);
  report['A.0-after-login'] = await snapshot(page, 'A0-admin-after-login');

  const navLinks = await getNavLinks(page);
  report.adminNavLinksDetected = navLinks;

  const items = ['Dashboard', 'Stores', 'Products', 'Users & Access', 'Users', 'Global Logs', 'Logs', 'Audit'];
  for (const name of items) {
    const ok = await clickNavItem(page, name);
    if (!ok) {
      report[`A-skip-${name}`] = { reason: 'nav item not found or not clickable' };
      continue;
    }
    const snap = await snapshot(page, `A-admin-${name.replace(/[^a-z0-9]+/gi, '_')}`);
    report[`A-${name}`] = snap;
  }

  // Save networks/console for this segment
  report.adminConsole = store.console.slice(0, 50);
  report.adminPageErrors = store.pageerrors.slice(0, 50);
  report.adminNetwork4xx5xx = store.network.slice(0, 50);

  await ctx.close();
}

async function runOperatorNav(browser, report) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const store = { console: [], pageerrors: [], network: [] };
  attachInstrumentation(page, 'operator-nav', store);

  await login(page, OPERATOR);
  report['B.0-after-login'] = await snapshot(page, 'B0-operator-after-login');

  const navLinks = await getNavLinks(page);
  report.operatorNavLinksDetected = navLinks;

  const items = ['Dashboard', 'Stores', 'Products'];
  for (const name of items) {
    const ok = await clickNavItem(page, name);
    if (!ok) {
      report[`B-skip-${name}`] = { reason: 'nav item not found' };
      continue;
    }
    const snap = await snapshot(page, `B-operator-${name.replace(/[^a-z0-9]+/gi, '_')}`);
    report[`B-${name}`] = snap;
  }

  // Check absence of admin items
  const adminItems = ['Users & Access', 'Users', 'Global Logs', 'Logs', 'Audit', 'Invites'];
  const absenceCheck = {};
  for (const a of adminItems) {
    const cnt = await page.locator(`nav a:has-text("${a}"), aside a:has-text("${a}"), [class*="sidebar"] a:has-text("${a}")`).count();
    absenceCheck[a] = cnt;
  }
  report.operatorAdminItemsCount = absenceCheck;

  report.operatorConsole = store.console.slice(0, 50);
  report.operatorPageErrors = store.pageerrors.slice(0, 50);
  report.operatorNetwork4xx5xx = store.network.slice(0, 50);

  await ctx.close();
}

async function runStoreTabs(browser, report) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const store = { console: [], pageerrors: [], network: [] };
  attachInstrumentation(page, 'store-tabs', store);

  await login(page, ADMIN);
  // Navigate to Stores
  await clickNavItem(page, 'Stores').catch(() => {});
  await sleep(1500);

  // Find a store link
  const firstStore = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/stores/"], [data-testid*="store"]'));
    const real = links.find(a => /\/stores\/[0-9a-f-]{30,}/i.test(a.getAttribute('href') || ''));
    return real ? real.getAttribute('href') : null;
  });
  report.firstStoreHref = firstStore;
  if (!firstStore) {
    report.storeTabsError = 'No store row link discovered';
    await ctx.close();
    return;
  }
  await page.goto(TARGET + firstStore, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  report['C.0-store-detail-landing'] = await snapshot(page, 'C0-store-landing');

  // Tab labels expected
  const tabs = ['Overview', 'Catalog', 'Prices', 'Advertising', 'Scale Devices', 'Versions', 'Publishing', 'Logs'];
  // Discover tab elements
  const tabsDetected = await page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll('[role="tab"], button[class*="tab" i], a[class*="tab" i], nav a, button, a'));
    const seen = new Set();
    const out = [];
    for (const el of cands) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 40) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      out.push({ text, tag: el.tagName, href: el.getAttribute('href') || null });
    }
    return out;
  });
  report.storeTabsDetected = tabsDetected;

  for (const t of tabs) {
    let ok = false;
    try {
      const loc = page.locator(`[role="tab"]:has-text("${t}"), button:has-text("${t}"), a:has-text("${t}")`).first();
      await loc.click({ timeout: 3500 });
      ok = true;
      await sleep(1500);
    } catch (e) { ok = false; }
    if (!ok) {
      report[`C-skip-${t}`] = { reason: 'tab not found or not clickable' };
      continue;
    }
    const snap = await snapshot(page, `C-tab-${t.replace(/[^a-z0-9]+/gi, '_')}`);
    report[`C-${t}`] = snap;
  }

  report.storeTabsConsole = store.console.slice(0, 80);
  report.storeTabsPageErrors = store.pageerrors.slice(0, 80);
  report.storeTabsNetwork4xx5xx = store.network.slice(0, 80);

  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = { startedAt: new Date().toISOString() };
  try {
    await runAdminNav(browser, report);
    await runOperatorNav(browser, report);
    await runStoreTabs(browser, report);
  } catch (e) {
    report.fatal = { message: e.message, stack: (e.stack || '').slice(0, 1500) };
  }
  report.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(EVI, 'ABC-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify({ ok: !report.fatal, keys: Object.keys(report).length, evidence: EVI }));
})();
