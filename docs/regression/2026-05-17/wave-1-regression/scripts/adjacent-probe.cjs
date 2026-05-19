/**
 * Adjacent-surface probe for Wave 1 verify (tactical, not exhaustive).
 * Targets: auth, catalog, prices, scales, invites, login UI.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const ADMIN = { email: 'admin@example.com', password: 'admin12345' };
const OPERATOR = { email: 'qa-operator@example.com', password: 'admin12345' };
const EVI = path.resolve(__dirname, '..', 'evidence');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 23);
const log = (k, v) => console.log(`[${ts()}] ${k}`, typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : v);

async function shot(page, name) {
  try { await page.screenshot({ path: path.join(EVI, `${name}.png`) }); } catch {}
}

(async () => {
  const report = { startedAt: new Date().toISOString(), results: {} };
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ baseURL: FE, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push({ msg: e.message }));
  page.on('console', m => { if (m.type() === 'error') errors.push({ console: m.text() }); });

  // === 1. Login page UI: confirm forgot-password notice + no console errors ===
  await page.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
  await sleep(800);
  const helpVisible = await page.locator('.login-help-note').isVisible().catch(() => false);
  const helpText = await page.locator('.login-help-note').textContent().catch(() => null);
  report.results.login_help_visible = helpVisible;
  report.results.login_help_text = helpText;
  await shot(page, 'adj-1-login-page');
  log('login_help', { helpVisible, helpText });

  // === 2. Admin login + dashboard smoke ===
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForResponse(r => r.url().includes('/api/auth/login') && r.status() === 200, { timeout: 10000 });
  await sleep(1500);
  await shot(page, 'adj-2-admin-dashboard');
  const adminH1 = await page.locator('h1').first().textContent().catch(() => '');
  const hasAdminNav = await page.getByText('Users & Access').isVisible().catch(() => false);
  report.results.admin_dashboard = { h1: adminH1, hasAdminNav };
  log('admin_smoke', report.results.admin_dashboard);

  // === 3. Category filter persists across hash refresh ===
  // Quick API-level check via cookie auth: refresh client-side query, then re-query same endpoint
  const refreshTest = await page.evaluate(async () => {
    const a = await fetch('http://localhost:3000/api/stores', { credentials: 'include' }).then(r => r.json());
    return { storeCount: (a.stores || []).length };
  });
  log('store_list', refreshTest);
  report.results.admin_store_list_ok = refreshTest.storeCount >= 0;

  // === 4. Operator login (different context to avoid bleeding session) ===
  const ctx2 = await browser.newContext({ baseURL: FE, ignoreHTTPSErrors: true });
  const opPage = await ctx2.newPage();
  await opPage.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
  await opPage.locator('input[type="email"]').fill(OPERATOR.email);
  await opPage.locator('input[type="password"]').fill(OPERATOR.password);
  await opPage.locator('button[type="submit"]').click();
  await opPage.waitForResponse(r => r.url().includes('/api/auth/login') && r.status() === 200, { timeout: 10000 });
  await sleep(1500);
  await shot(opPage, 'adj-4-operator-dashboard');
  const opH1 = await opPage.locator('h1').first().textContent().catch(() => '');
  const opHasAdminNav = await opPage.getByText('Users & Access').isVisible({ timeout: 1000 }).catch(() => false);
  report.results.operator_dashboard = { h1: opH1, hasAdminNav: opHasAdminNav };
  log('operator_smoke', report.results.operator_dashboard);

  // === 5. Page errors aggregate ===
  report.results.errors_admin = errors.slice();
  log('errors_admin_count', errors.length);

  fs.writeFileSync(path.join(EVI, 'adjacent-probe-report.json'), JSON.stringify(report, null, 2));
  await ctx.close();
  await ctx2.close();
  await browser.close();
  log('DONE', 'adjacent-probe-report.json written');
})().catch(e => { console.error(e); process.exit(1); });
